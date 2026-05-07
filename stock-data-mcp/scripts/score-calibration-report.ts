import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runEtfBatchDecide } from "../src/etf-batch-decide.js";
import { getEtfUniverse } from "../src/etf-universe.js";
import { runSectorList } from "../src/stock-data.js";

type ScoreRow = {
  symbol: string;
  name: string;
  technicalPosition: number;
  riskReward: number;
  sectorHotness: number;
  frictionContribution: number;
  total: number;
  rrValue: number;
  action: string;
  actionReasons: string[];
};

type ExperimentKey = "A_v1_baseline" | "B_v2_balanced" | "C_v2_with_v1_rr";

type ExperimentConfig = {
  scoreCalibrationVersion: "v1" | "v2";
  riskRewardModel: "v1" | "v2_balanced";
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * q)));
  return Number((sorted[idx] ?? 0).toFixed(3));
}

function stat(values: number[]) {
  const n = values.length;
  const mean = n === 0 ? 0 : values.reduce((s, v) => s + v, 0) / n;
  const variance = n === 0 ? 0 : values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return {
    count: n,
    mean: Number(mean.toFixed(3)),
    std: Number(Math.sqrt(variance).toFixed(3)),
    p10: percentile(values, 0.1),
    p25: percentile(values, 0.25),
    p50: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    p90: percentile(values, 0.9)
  };
}

async function main() {
  const outDir = resolve(process.cwd(), "tmp", "score-calibration");
  const generatedAt = new Date().toISOString();
  const universe = getEtfUniverse();
  const symbols = universe.map((u) => u.symbol);
  const batches = chunk(symbols, 20);
  const days = 60;
  const source = "xueqiu" as const;
  const fixedSectors = await runSectorList({ sortBy: "hot", timeout: 60 });

  const experiments: Record<ExperimentKey, ExperimentConfig> = {
    A_v1_baseline: { scoreCalibrationVersion: "v1", riskRewardModel: "v1" },
    B_v2_balanced: { scoreCalibrationVersion: "v2", riskRewardModel: "v2_balanced" },
    C_v2_with_v1_rr: { scoreCalibrationVersion: "v2", riskRewardModel: "v1" }
  };

  const byExperiment: Record<ExperimentKey, ScoreRow[]> = {
    A_v1_baseline: [],
    B_v2_balanced: [],
    C_v2_with_v1_rr: []
  };

  for (const [expKey, exp] of Object.entries(experiments) as [ExperimentKey, ExperimentConfig][]) {
    for (const batchSymbols of batches) {
      const res = await runEtfBatchDecide({
        symbols: batchSymbols,
        days,
        source,
        timeout: 60,
        scoreCalibrationVersion: exp.scoreCalibrationVersion,
        riskRewardModel: exp.riskRewardModel
      }, {
        sectorList: async () => fixedSectors
      });
      for (const item of res.results) {
        const frictionContribution = Number(
          (item.scoring.total - item.scoring.layerB.technicalPosition - item.scoring.layerB.riskReward - item.scoring.layerB.sectorHotness).toFixed(3)
        );
        const entry = item.positioning.entryPrice;
        const stop = item.positioning.stopLoss;
        const high30 = item.marketState.high30;
        const rrValue = entry > stop ? Number(((high30 - entry) / (entry - stop)).toFixed(3)) : 0;
        byExperiment[expKey].push({
          symbol: item.symbol,
          name: item.name,
          technicalPosition: item.scoring.layerB.technicalPosition,
          riskReward: item.scoring.layerB.riskReward,
          sectorHotness: item.scoring.layerB.sectorHotness,
          frictionContribution,
          total: item.scoring.total,
          rrValue,
          action: item.action,
          actionReasons: item.actionReasons
        });
      }
    }
  }

  const summarize = (rows: ScoreRow[]) => {
    const total = rows.map((r) => r.total);
    const t = rows.map((r) => r.technicalPosition);
    const rrScore = rows.map((r) => r.riskReward);
    const sh = rows.map((r) => r.sectorHotness);
    const fr = rows.map((r) => r.frictionContribution);
    const rr = rows.map((r) => r.rrValue);
    const actionCounts = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.action] = (acc[r.action] ?? 0) + 1;
      return acc;
    }, {});
    const lowRows = rows.filter((r) => r.total < 50);
    const lowMain = lowRows.reduce<Record<string, number>>((acc, row) => {
      const candidates = [
        ["technicalPosition", row.technicalPosition],
        ["riskReward", row.riskReward],
        ["sectorHotness", row.sectorHotness]
      ] as const;
      candidates.sort((a, b) => a[1] - b[1]);
      const key = candidates[0]?.[0] ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return {
      totalStats: stat(total),
      technicalStats: stat(t),
      riskRewardStats: stat(rrScore),
      rrValueStats: stat(rr),
      sectorStats: stat(sh),
      frictionStats: stat(fr),
      ge70Pct: Number(((rows.filter((r) => r.total >= 70).length / Math.max(1, rows.length)) * 100).toFixed(2)),
      lowScorePct: Number(((lowRows.length / Math.max(1, rows.length)) * 100).toFixed(2)),
      rrBins: {
        lt08: rows.filter((r) => r.rrValue < 0.8).length,
        b08_1: rows.filter((r) => r.rrValue >= 0.8 && r.rrValue < 1).length,
        b1_15: rows.filter((r) => r.rrValue >= 1 && r.rrValue < 1.5).length,
        b15_2: rows.filter((r) => r.rrValue >= 1.5 && r.rrValue < 2).length,
        b2p: rows.filter((r) => r.rrValue >= 2).length
      },
      actionCounts,
      lowScoreMainDriver: lowMain
    };
  };

  const A = summarize(byExperiment.A_v1_baseline);
  const B = summarize(byExperiment.B_v2_balanced);
  const C = summarize(byExperiment.C_v2_with_v1_rr);

  const diff = (x: number, y: number) => Number((x - y).toFixed(3));
  const deltas = {
    delta_non_rr: {
      totalP50: diff(C.totalStats.p50, A.totalStats.p50),
      totalP75: diff(C.totalStats.p75, A.totalStats.p75),
      ge70Pct: diff(C.ge70Pct, A.ge70Pct),
      lowScorePct: diff(C.lowScorePct, A.lowScorePct)
    },
    delta_rr_only: {
      totalP50: diff(B.totalStats.p50, C.totalStats.p50),
      totalP75: diff(B.totalStats.p75, C.totalStats.p75),
      ge70Pct: diff(B.ge70Pct, C.ge70Pct),
      lowScorePct: diff(B.lowScorePct, C.lowScorePct)
    },
    delta_total: {
      totalP50: diff(B.totalStats.p50, A.totalStats.p50),
      totalP75: diff(B.totalStats.p75, A.totalStats.p75),
      ge70Pct: diff(B.ge70Pct, A.ge70Pct),
      lowScorePct: diff(B.lowScorePct, A.lowScorePct)
    }
  };

  const report = {
    generatedAt,
    sampleWindow: {
      universeCount: symbols.length,
      symbols,
      days
    },
    experiments: {
      A_v1_baseline: A,
      B_v2_balanced: B,
      C_v2_with_v1_rr: C
    },
    deltas
  };

  const markdown = [
    `# Score Calibration Report`,
    ``,
    `- GeneratedAt: ${generatedAt}`,
    `- Sample: ${symbols.length} ETFs, days=${days}`,
    ``,
    `## A: v1 baseline`,
    `- total p50: ${A.totalStats.p50}, p75: ${A.totalStats.p75}, >=70: ${A.ge70Pct}%`,
    `- low-score(<50): ${A.lowScorePct}%`,
    `- actionCounts: ${JSON.stringify(A.actionCounts)}`,
    ``,
    `## C: v2 with v1 rr (non-RR delta isolator)`,
    `- total p50: ${C.totalStats.p50}, p75: ${C.totalStats.p75}, >=70: ${C.ge70Pct}%`,
    `- low-score(<50): ${C.lowScorePct}%`,
    `- actionCounts: ${JSON.stringify(C.actionCounts)}`,
    ``,
    `## B: v2 balanced (full change)`,
    `- total p50: ${B.totalStats.p50}, p75: ${B.totalStats.p75}, >=70: ${B.ge70Pct}%`,
    `- low-score(<50): ${B.lowScorePct}%`,
    `- actionCounts: ${JSON.stringify(B.actionCounts)}`,
    ``,
    `## Delta`,
    `- non-RR(C-A): p50=${deltas.delta_non_rr.totalP50}, p75=${deltas.delta_non_rr.totalP75}, >=70=${deltas.delta_non_rr.ge70Pct}%, <50=${deltas.delta_non_rr.lowScorePct}%`,
    `- RR-only(B-C): p50=${deltas.delta_rr_only.totalP50}, p75=${deltas.delta_rr_only.totalP75}, >=70=${deltas.delta_rr_only.ge70Pct}%, <50=${deltas.delta_rr_only.lowScorePct}%`,
    `- total(B-A): p50=${deltas.delta_total.totalP50}, p75=${deltas.delta_total.totalP75}, >=70=${deltas.delta_total.ge70Pct}%, <50=${deltas.delta_total.lowScorePct}%`
  ].join("\n");

  await mkdir(outDir, { recursive: true });
  const jsonPath = resolve(outDir, "score-calibration-report.json");
  const mdPath = resolve(outDir, "score-calibration-report.md");
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf-8");
  await writeFile(mdPath, markdown, "utf-8");

  console.log(markdown);
  console.log(`\nSaved: ${jsonPath}`);
  console.log(`Saved: ${mdPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
