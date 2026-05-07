import test from "node:test";
import assert from "node:assert/strict";
import { runEtfBatchDecide } from "../src/etf-batch-decide.js";
import type { EtfBatchAnalyzeResponse, PortfolioSnapshot, SectorListResponse } from "../src/types.js";

const analyzeOk: EtfBatchAnalyzeResponse = {
  source: "xueqiu",
  generatedAt: "2026-05-05T08:00:00.000Z",
  total: 1,
  successCount: 1,
  errorCount: 0,
  results: [
    {
      symbol: "510300",
      normalizedSymbol: "SH510300",
      quote: {
        symbol: "510300",
        name: "沪深300ETF",
        price: 3.5,
        changePercent: 0.5,
        changeAmount: 0.02,
        open: 3.48,
        high: 3.52,
        low: 3.46,
        prevClose: 3.48,
        volume: 1000000,
        amount: 3500000
      },
      indicators: {
        current: 3.5,
        ma5: 3.45,
        ma10: 3.42,
        ma20: 3.38,
        high30: 3.9,
        low30: 3.2,
        trend: "bullish"
      },
      recentKlines: []
    }
  ],
  errors: []
};

const sectorsOk: SectorListResponse = {
  source: "akshare_ths",
  generatedAt: "2026-05-05T08:00:00.000Z",
  sortBy: "hot",
  total: 3,
  newsScoreDegraded: false,
  data: [
    { sectorName: "A", changePercent: 1, upCount: 1, downCount: 1, amount: 1, netInflow: 1, leaderStock: "A", leaderLatestPrice: 1, leaderChangePercent: 1, marketScore: 80, newsScore: 80, hotScore: 80 },
    { sectorName: "B", changePercent: 1, upCount: 1, downCount: 1, amount: 1, netInflow: 1, leaderStock: "B", leaderLatestPrice: 1, leaderChangePercent: 1, marketScore: 60, newsScore: 60, hotScore: 60 },
    { sectorName: "C", changePercent: 1, upCount: 1, downCount: 1, amount: 1, netInflow: 1, leaderStock: "C", leaderLatestPrice: 1, leaderChangePercent: 1, marketScore: 40, newsScore: 40, hotScore: 40 }
  ]
};

const snapshotOk: PortfolioSnapshot = {
  portfolio: {
    totalCapital: 32180,
    availableCapital: 20000,
    positions: [
      {
        symbol: "510300",
        name: "沪深300ETF",
        quantity: 500,
        costPrice: 3.3,
        currentPrice: 3.5,
        marketValue: 1750
      }
    ],
    updatedAt: "2026-05-05T08:00:00.000Z"
  },
  orders: [
    { symbol: "510300", name: "沪深300ETF", side: "buy", quantity: 200, orderTime: "2026-05-05T08:01:00.000Z", status: "pending" }
  ],
  stats: { total: 1, pending: 1, filled: 0, cancelled: 0, expired: 0 },
  generatedAt: "2026-05-05T08:02:00.000Z"
};

test("runEtfBatchDecide returns structured decision output", async () => {
  const response = await runEtfBatchDecide(
    { symbols: ["510300"] },
    {
      batchAnalyze: async () => analyzeOk,
      batchQuote: async () => ({ source: "xueqiu", generatedAt: "", total: 1, successCount: 1, errorCount: 0, results: [{ symbol: "510300", normalizedSymbol: "SH510300", data: analyzeOk.results[0]!.quote }], errors: [] }),
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => snapshotOk
    },
    () => new Date("2026-05-05T08:03:00.000Z")
  );

  assert.equal(response.globalChecks.status, "ok");
  assert.equal(response.results.length, 1);
  assert.equal(response.results[0]!.unitCheck.status, "pass");
  assert.ok(response.results[0]!.exposureMetrics.symbolCap > 6400);
  assert.ok(response.results[0]!.positioning.targetQty >= 0);
  assert.equal(response.results[0]!.marketState.trend, "bullish");
  assert.equal(response.results[0]!.marketState.trendZh, "多头");
  assert.equal(response.results[0]!.marketState.structurePass, true);
  assert.equal(response.results[0]!.marketState.structureReason, "passed");
  assert.equal(response.results[0]!.marketState.structureReasonZh, "结构通过");
  assert.equal(typeof response.results[0]!.marketState.priceVsMa10Pct, "number");
  assert.equal(typeof response.results[0]!.marketState.safetyMarginPct, "number");
  assert.equal("executionFriction" in response.results[0]!.scoring.layerB, false);
  assert.ok(Array.isArray(response.results[0]!.actionReasons));
  assert.ok(response.results[0]!.actionReasons.length > 0);
  assert.equal(response.results[0]!.actionReasons.some((reason) => (reason as string) === "other"), false);
  assert.equal("snapshotStalenessWarning" in response.snapshotMeta, false);
});

test("runEtfBatchDecide assigns score_below_buy_threshold for hold_watch", async () => {
  const response = await runEtfBatchDecide(
    { symbols: ["510300"] },
    {
      batchAnalyze: async () => analyzeOk,
      batchQuote: async () => ({ source: "xueqiu", generatedAt: "", total: 1, successCount: 1, errorCount: 0, results: [{ symbol: "510300", normalizedSymbol: "SH510300", data: analyzeOk.results[0]!.quote }], errors: [] }),
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => snapshotOk
    },
    () => new Date("2026-05-05T08:03:00.000Z")
  );

  assert.equal(response.results[0]!.action, "hold_watch");
  assert.ok(response.results[0]!.actionReasons.includes("score_below_buy_threshold"));
});

test("runEtfBatchDecide assigns target_qty_below_lot for hold_watch", async () => {
  const lowCashSnapshot: PortfolioSnapshot = {
    ...snapshotOk,
    portfolio: {
      ...snapshotOk.portfolio!,
      availableCapital: 10
    }
  };
  const response = await runEtfBatchDecide(
    { symbols: ["510300"] },
    {
      batchAnalyze: async () => analyzeOk,
      batchQuote: async () => ({ source: "xueqiu", generatedAt: "", total: 1, successCount: 1, errorCount: 0, results: [{ symbol: "510300", normalizedSymbol: "SH510300", data: analyzeOk.results[0]!.quote }], errors: [] }),
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => lowCashSnapshot
    },
    () => new Date("2026-05-05T08:03:00.000Z")
  );

  assert.equal(response.results[0]!.action, "hold_watch");
  assert.ok(response.results[0]!.actionReasons.includes("target_qty_below_lot"));
});

test("runEtfBatchDecide assigns pending_order_already_sufficient for hold_watch", async () => {
  const customAnalyze: EtfBatchAnalyzeResponse = {
    ...analyzeOk,
    results: [
      {
        ...analyzeOk.results[0]!,
        indicators: {
          ...analyzeOk.results[0]!.indicators,
          low30: 0.1
        }
      }
    ]
  };
  const highPendingSnapshot: PortfolioSnapshot = {
    ...snapshotOk,
    portfolio: {
      ...snapshotOk.portfolio!,
      totalCapital: 100000,
      availableCapital: 80000
    },
    orders: [
      { symbol: "510300", name: "沪深300ETF", side: "buy", quantity: 500, orderTime: "2026-05-05T08:01:00.000Z", status: "pending" }
    ]
  };
  const response = await runEtfBatchDecide(
    { symbols: ["510300"] },
    {
      batchAnalyze: async () => customAnalyze,
      batchQuote: async () => ({ source: "xueqiu", generatedAt: "", total: 1, successCount: 1, errorCount: 0, results: [{ symbol: "510300", normalizedSymbol: "SH510300", data: customAnalyze.results[0]!.quote }], errors: [] }),
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => highPendingSnapshot
    },
    () => new Date("2026-05-05T08:03:00.000Z")
  );

  assert.equal(response.results[0]!.action, "hold_watch");
  assert.ok(response.results[0]!.actionReasons.includes("pending_order_already_sufficient"));
});

test("runEtfBatchDecide assigns buy_signal_confirmed for open_buy", async () => {
  const strongAnalyze: EtfBatchAnalyzeResponse = {
    ...analyzeOk,
    results: [
      {
        ...analyzeOk.results[0]!,
        indicators: {
          ...analyzeOk.results[0]!.indicators,
          high30: 6.5,
          low30: 2.2
        }
      }
    ]
  };
  const noPendingSnapshot: PortfolioSnapshot = {
    ...snapshotOk,
    portfolio: {
      ...snapshotOk.portfolio!,
      totalCapital: 200000,
      availableCapital: 150000
    },
    orders: []
  };
  const response = await runEtfBatchDecide(
    { symbols: ["510300"] },
    {
      batchAnalyze: async () => strongAnalyze,
      batchQuote: async () => ({ source: "xueqiu", generatedAt: "", total: 1, successCount: 1, errorCount: 0, results: [{ symbol: "510300", normalizedSymbol: "SH510300", data: strongAnalyze.results[0]!.quote }], errors: [] }),
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => noPendingSnapshot
    },
    () => new Date("2026-05-05T08:03:00.000Z")
  );

  assert.equal(response.results[0]!.action, "open_buy");
  assert.ok(response.results[0]!.actionReasons.includes("buy_signal_confirmed"));
  assert.equal(response.results[0]!.actionReasons.includes("unknown_reason"), false);
});

test("runEtfBatchDecide assigns buy_signal_confirmed for increase_buy", async () => {
  const strongAnalyze: EtfBatchAnalyzeResponse = {
    ...analyzeOk,
    results: [
      {
        ...analyzeOk.results[0]!,
        indicators: {
          ...analyzeOk.results[0]!.indicators,
          high30: 6.5,
          low30: 2.2
        }
      }
    ]
  };
  const increaseSnapshot: PortfolioSnapshot = {
    ...snapshotOk,
    portfolio: {
      ...snapshotOk.portfolio!,
      totalCapital: 200000,
      availableCapital: 150000
    },
    orders: [{ symbol: "510300", name: "沪深300ETF", side: "buy", quantity: 200, orderTime: "2026-05-05T08:01:00.000Z", status: "pending" }]
  };
  const response = await runEtfBatchDecide(
    { symbols: ["510300"] },
    {
      batchAnalyze: async () => strongAnalyze,
      batchQuote: async () => ({ source: "xueqiu", generatedAt: "", total: 1, successCount: 1, errorCount: 0, results: [{ symbol: "510300", normalizedSymbol: "SH510300", data: strongAnalyze.results[0]!.quote }], errors: [] }),
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => increaseSnapshot
    },
    () => new Date("2026-05-05T08:03:00.000Z")
  );

  assert.equal(response.results[0]!.action, "increase_buy");
  assert.ok(response.results[0]!.actionReasons.includes("buy_signal_confirmed"));
  assert.equal(response.results[0]!.actionReasons.includes("unknown_reason"), false);
});

test("runEtfBatchDecide assigns buy_signal_confirmed for replace_buy", async () => {
  const strongAnalyze: EtfBatchAnalyzeResponse = {
    ...analyzeOk,
    results: [
      {
        ...analyzeOk.results[0]!,
        indicators: {
          ...analyzeOk.results[0]!.indicators,
          high30: 6.5,
          low30: 2.2
        }
      }
    ]
  };
  const replaceSnapshot: PortfolioSnapshot = {
    ...snapshotOk,
    portfolio: {
      ...snapshotOk.portfolio!,
      totalCapital: 200000,
      availableCapital: 150000
    },
    orders: [{ symbol: "510300", name: "沪深300ETF", side: "buy", quantity: 10000, orderTime: "2026-05-05T08:01:00.000Z", status: "pending" }]
  };
  const response = await runEtfBatchDecide(
    { symbols: ["510300"] },
    {
      batchAnalyze: async () => strongAnalyze,
      batchQuote: async () => ({ source: "xueqiu", generatedAt: "", total: 1, successCount: 1, errorCount: 0, results: [{ symbol: "510300", normalizedSymbol: "SH510300", data: strongAnalyze.results[0]!.quote }], errors: [] }),
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => replaceSnapshot
    },
    () => new Date("2026-05-05T08:03:00.000Z")
  );

  assert.equal(response.results[0]!.action, "replace_buy");
  assert.ok(response.results[0]!.actionReasons.includes("buy_signal_confirmed"));
  assert.equal(response.results[0]!.actionReasons.includes("unknown_reason"), false);
});

test("runEtfBatchDecide maps bearish trend to 空头", async () => {
  const bearishAnalyze: EtfBatchAnalyzeResponse = {
    ...analyzeOk,
    results: [
      {
        ...analyzeOk.results[0]!,
        indicators: {
          ...analyzeOk.results[0]!.indicators,
          trend: "bearish"
        }
      }
    ]
  };

  const response = await runEtfBatchDecide(
    { symbols: ["510300"] },
    {
      batchAnalyze: async () => bearishAnalyze,
      batchQuote: async () => ({ source: "xueqiu", generatedAt: "", total: 1, successCount: 1, errorCount: 0, results: [{ symbol: "510300", normalizedSymbol: "SH510300", data: bearishAnalyze.results[0]!.quote }], errors: [] }),
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => snapshotOk
    },
    () => new Date("2026-05-05T08:03:00.000Z")
  );

  assert.equal(response.results.length, 1);
  assert.equal(response.results[0]!.marketState.trend, "bearish");
  assert.equal(response.results[0]!.marketState.trendZh, "空头");
});

test("runEtfBatchDecide aborts when snapshot is missing", async () => {
  const response = await runEtfBatchDecide(
    { symbols: ["510300"] },
    {
      batchAnalyze: async () => analyzeOk,
      batchQuote: async () => ({ source: "xueqiu", generatedAt: "", total: 1, successCount: 1, errorCount: 0, results: [{ symbol: "510300", normalizedSymbol: "SH510300", data: analyzeOk.results[0]!.quote }], errors: [] }),
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => ({ ...snapshotOk, portfolio: null })
    }
  );

  assert.equal(response.globalChecks.status, "aborted");
  assert.equal(response.errors[0]?.code, "MISSING_ACCOUNT_SNAPSHOT");
});

test("runEtfBatchDecide aborts on unit mismatch", async () => {
  const response = await runEtfBatchDecide(
    { symbols: ["510300"] },
    {
      batchAnalyze: async () => ({
        ...analyzeOk,
        results: [{
          ...analyzeOk.results[0]!,
          quote: { ...analyzeOk.results[0]!.quote, price: 120 }
        }]
      }),
      batchQuote: async () => ({ source: "xueqiu", generatedAt: "", total: 1, successCount: 1, errorCount: 0, results: [{ symbol: "510300", normalizedSymbol: "SH510300", data: { ...analyzeOk.results[0]!.quote, price: 120 } }], errors: [] }),
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => snapshotOk
    }
  );

  assert.equal(response.globalChecks.status, "aborted");
  assert.ok(response.errors.some((e) => e.code === "UNIT_MISMATCH"));
  assert.equal(response.results[0]!.actionReasons[0], "unit_mismatch");
});

test("runEtfBatchDecide does not report staleness for old snapshot timestamp", async () => {
  const staleSnapshot: PortfolioSnapshot = {
    ...snapshotOk,
    portfolio: {
      ...snapshotOk.portfolio!,
      updatedAt: "2026-04-01T08:00:00.000Z"
    }
  };

  const response = await runEtfBatchDecide(
    { symbols: ["510300"] },
    {
      batchAnalyze: async () => analyzeOk,
      batchQuote: async () => ({ source: "xueqiu", generatedAt: "", total: 1, successCount: 1, errorCount: 0, results: [{ symbol: "510300", normalizedSymbol: "SH510300", data: analyzeOk.results[0]!.quote }], errors: [] }),
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => staleSnapshot
    },
    () => new Date("2026-05-05T08:03:00.000Z")
  );

  assert.equal(response.globalChecks.status, "ok");
  assert.equal(response.errors.length, 0);
});

test("runEtfBatchDecide uses mapped sector hot score when available", async () => {
  const analyzeMapped: EtfBatchAnalyzeResponse = {
    ...analyzeOk,
    results: [
      {
        ...analyzeOk.results[0]!,
        symbol: "512480",
        normalizedSymbol: "SH512480",
        quote: {
          ...analyzeOk.results[0]!.quote,
          symbol: "512480",
          name: "半导体ETF国联安"
        }
      }
    ]
  };

  const quoteMapped = {
    source: "xueqiu" as const,
    generatedAt: "",
    total: 1,
    successCount: 1,
    errorCount: 0,
    results: [{ symbol: "512480", normalizedSymbol: "SH512480", data: analyzeMapped.results[0]!.quote }],
    errors: []
  };

  const sectorsMapped: SectorListResponse = {
    ...sectorsOk,
    data: [
      { sectorName: "半导体", changePercent: 1, upCount: 1, downCount: 1, amount: 1, netInflow: 1, leaderStock: "A", leaderLatestPrice: 1, leaderChangePercent: 1, marketScore: 0.9, newsScore: 0.9, hotScore: 0.9 },
      { sectorName: "B", changePercent: 1, upCount: 1, downCount: 1, amount: 1, netInflow: 1, leaderStock: "B", leaderLatestPrice: 1, leaderChangePercent: 1, marketScore: 0.6, newsScore: 0.6, hotScore: 0.6 },
      { sectorName: "C", changePercent: 1, upCount: 1, downCount: 1, amount: 1, netInflow: 1, leaderStock: "C", leaderLatestPrice: 1, leaderChangePercent: 1, marketScore: 0.4, newsScore: 0.4, hotScore: 0.4 }
    ]
  };

  const response = await runEtfBatchDecide(
    { symbols: ["512480"] },
    {
      batchAnalyze: async () => analyzeMapped,
      batchQuote: async () => quoteMapped,
      sectorList: async () => sectorsMapped,
      portfolioSnapshot: async () => snapshotOk
    },
    () => new Date("2026-05-05T08:03:00.000Z")
  );

  assert.equal(response.results.length, 1);
  assert.equal(response.results[0]!.scoring.layerB.sectorHotness, 20);
});

test("runEtfBatchDecide uses 63 threshold when layerA fails", async () => {
  const bearishHighScore: EtfBatchAnalyzeResponse = {
    ...analyzeOk,
    results: [
      {
        ...analyzeOk.results[0]!,
        indicators: {
          ...analyzeOk.results[0]!.indicators,
          trend: "bearish",
          ma5: 3.6,
          ma10: 3.55,
          high30: 6,
          low30: 2.5
        }
      }
    ]
  };

  const bearishLowScore: EtfBatchAnalyzeResponse = {
    ...bearishHighScore,
    results: [
      {
        ...bearishHighScore.results[0]!,
        indicators: {
          ...bearishHighScore.results[0]!.indicators,
          high30: 4.3
        }
      }
    ]
  };

  const quotePayload = (a: EtfBatchAnalyzeResponse) => ({
    source: "xueqiu" as const,
    generatedAt: "",
    total: 1,
    successCount: 1,
    errorCount: 0,
    results: [{ symbol: "510300", normalizedSymbol: "SH510300", data: a.results[0]!.quote }],
    errors: []
  });

  const high = await runEtfBatchDecide(
    { symbols: ["510300"] },
    {
      batchAnalyze: async () => bearishHighScore,
      batchQuote: async () => quotePayload(bearishHighScore),
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => snapshotOk
    },
    () => new Date("2026-05-05T08:03:00.000Z")
  );
  assert.equal(high.results[0]!.scoring.layerA.passed, false);
  assert.ok(high.results[0]!.scoring.total >= 63);
  assert.equal(high.results[0]!.action, "hold_watch");

  const low = await runEtfBatchDecide(
    { symbols: ["510300"] },
    {
      batchAnalyze: async () => bearishLowScore,
      batchQuote: async () => quotePayload(bearishLowScore),
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => snapshotOk
    },
    () => new Date("2026-05-05T08:03:00.000Z")
  );
  assert.equal(low.results[0]!.scoring.layerA.passed, false);
  assert.ok(low.results[0]!.scoring.total < high.results[0]!.scoring.total);
  assert.equal(low.results[0]!.action, "hold_watch");
});

test("runEtfBatchDecide ignores scoreCalibrationVersion and always uses v2", async () => {
  const baseDeps = {
    batchAnalyze: async () => analyzeOk,
    batchQuote: async () => ({ source: "xueqiu" as const, generatedAt: "", total: 1, successCount: 1, errorCount: 0, results: [{ symbol: "510300", normalizedSymbol: "SH510300", data: analyzeOk.results[0]!.quote }], errors: [] }),
    sectorList: async () => sectorsOk,
    portfolioSnapshot: async () => snapshotOk
  };

  const noVersion = await runEtfBatchDecide(
    { symbols: ["510300"] },
    baseDeps,
    () => new Date("2026-05-05T08:03:00.000Z")
  );

  const forcedV1 = await runEtfBatchDecide(
    { symbols: ["510300"], scoreCalibrationVersion: "v1" },
    baseDeps,
    () => new Date("2026-05-05T08:03:00.000Z")
  );

  const forcedV2 = await runEtfBatchDecide(
    { symbols: ["510300"], scoreCalibrationVersion: "v2" },
    baseDeps,
    () => new Date("2026-05-05T08:03:00.000Z")
  );

  assert.equal(noVersion.globalChecks.status, "ok");
  assert.equal(forcedV1.globalChecks.status, "ok");
  assert.equal(forcedV2.globalChecks.status, "ok");
  assert.equal(noVersion.results[0]!.scoring.total, forcedV1.results[0]!.scoring.total);
  assert.equal(noVersion.results[0]!.scoring.total, forcedV2.results[0]!.scoring.total);
  assert.equal(noVersion.results[0]!.scoring.layerB.riskReward, forcedV1.results[0]!.scoring.layerB.riskReward);
  assert.equal(noVersion.results[0]!.scoring.layerB.riskReward, forcedV2.results[0]!.scoring.layerB.riskReward);
});

test("runEtfBatchDecide v2 lifts riskReward when ATR-based stop is tighter", async () => {
  const analyzeWithAtr: EtfBatchAnalyzeResponse = {
    ...analyzeOk,
    results: [
      {
        ...analyzeOk.results[0]!,
        indicators: {
          ...analyzeOk.results[0]!.indicators,
          current: 3.5,
          ma5: 3.5,
          ma10: 3.45,
          ma20: 3.4,
          high30: 3.9,
          low30: 3.2,
          trend: "bullish"
        },
        quote: {
          ...analyzeOk.results[0]!.quote,
          price: 3.5
        },
        recentKlines: [
          { date: "2026-04-20", open: 3.45, close: 3.47, high: 3.49, low: 3.44, volume: 1, changePercent: 0.2 },
          { date: "2026-04-21", open: 3.47, close: 3.5, high: 3.52, low: 3.46, volume: 1, changePercent: 0.3 },
          { date: "2026-04-22", open: 3.5, close: 3.48, high: 3.51, low: 3.46, volume: 1, changePercent: -0.2 },
          { date: "2026-04-23", open: 3.48, close: 3.5, high: 3.53, low: 3.47, volume: 1, changePercent: 0.2 },
          { date: "2026-04-24", open: 3.5, close: 3.49, high: 3.52, low: 3.47, volume: 1, changePercent: -0.1 }
        ]
      }
    ]
  };

  const quotePayload = {
    source: "xueqiu" as const,
    generatedAt: "",
    total: 1,
    successCount: 1,
    errorCount: 0,
    results: [{ symbol: "510300", normalizedSymbol: "SH510300", data: analyzeWithAtr.results[0]!.quote }],
    errors: []
  };

  const result = await runEtfBatchDecide(
    { symbols: ["510300"] },
    {
      batchAnalyze: async () => analyzeWithAtr,
      batchQuote: async () => quotePayload,
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => snapshotOk
    }
  );

  assert.ok(result.results[0]!.scoring.layerB.riskReward > 0);
});

test("runEtfBatchDecide rejects deprecated riskRewardModel input", async () => {
  await assert.rejects(
    () => runEtfBatchDecide({ symbols: ["510300"], riskRewardModel: "v1" } as unknown as Parameters<typeof runEtfBatchDecide>[0]),
    /riskRewardModel is deprecated/
  );
});

test("runEtfBatchDecide retries temporary analyze failure and succeeds", async () => {
  let analyzeAttempts = 0;
  const response = await runEtfBatchDecide(
    { symbols: ["510300"], timeout: 20 },
    {
      batchAnalyze: async () => {
        analyzeAttempts += 1;
        if (analyzeAttempts < 3) {
          throw new Error("503 upstream unavailable");
        }
        return analyzeOk;
      },
      batchQuote: async () => ({ source: "xueqiu", generatedAt: "", total: 1, successCount: 1, errorCount: 0, results: [{ symbol: "510300", normalizedSymbol: "SH510300", data: analyzeOk.results[0]!.quote }], errors: [] }),
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => snapshotOk
    }
  );

  assert.equal(analyzeAttempts, 3);
  assert.equal(response.globalChecks.status, "ok");
  assert.equal(response.results.length, 1);
});

test("runEtfBatchDecide fails fast on auth error without retry", async () => {
  let quoteAttempts = 0;
  const response = await runEtfBatchDecide(
    { symbols: ["510300"], timeout: 20 },
    {
      batchAnalyze: async () => analyzeOk,
      batchQuote: async () => {
        quoteAttempts += 1;
        throw new Error("xueqiu auth failed (401 Unauthorized)");
      },
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => snapshotOk
    }
  );

  assert.equal(quoteAttempts, 1);
  assert.equal(response.globalChecks.status, "failed");
  assert.equal(response.globalChecks.reasonCode, "UPSTREAM_AUTH");
  assert.equal(response.results.length, 0);
});

test("runEtfBatchDecide fails when timeout budget is exhausted", async () => {
  const response = await runEtfBatchDecide(
    { symbols: ["510300"], timeout: 1 },
    {
      batchAnalyze: async () => {
        throw new Error("request timed out");
      },
      batchQuote: async () => ({ source: "xueqiu", generatedAt: "", total: 1, successCount: 1, errorCount: 0, results: [{ symbol: "510300", normalizedSymbol: "SH510300", data: analyzeOk.results[0]!.quote }], errors: [] }),
      sectorList: async () => sectorsOk,
      portfolioSnapshot: async () => snapshotOk
    }
  );

  assert.equal(response.globalChecks.status, "failed");
  assert.equal(response.globalChecks.reasonCode, "TIMEOUT_BUDGET_EXHAUSTED");
  assert.equal(response.results.length, 0);
  assert.ok(response.errors[0]?.stage === "analyze" || response.errors[0]?.stage === "snapshot");
});
