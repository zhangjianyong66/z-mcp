import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateMarketScores,
  calculateNewsScores
} from "../src/sector-hotness.js";
import type { SectorSnapshotItem } from "../src/types.js";

const samples: SectorSnapshotItem[] = [
  {
    sectorName: "白酒",
    changePercent: 3.2,
    upCount: 20,
    downCount: 2,
    amount: 1200,
    netInflow: 80,
    leaderStock: "迎驾贡酒",
    leaderLatestPrice: 39,
    leaderChangePercent: 10
  },
  {
    sectorName: "半导体",
    changePercent: 1.1,
    upCount: 18,
    downCount: 9,
    amount: 1000,
    netInflow: 65,
    leaderStock: "北方华创",
    leaderLatestPrice: 120,
    leaderChangePercent: 6
  },
  {
    sectorName: "煤炭",
    changePercent: -0.8,
    upCount: 6,
    downCount: 20,
    amount: 600,
    netInflow: -10,
    leaderStock: "华电能源",
    leaderLatestPrice: 5,
    leaderChangePercent: 2
  }
];

test("calculateMarketScores returns normalized scores", () => {
  const scores = calculateMarketScores(samples);
  assert.equal(scores.length, 3);
  assert.ok(scores[0]! > scores[1]!);
  assert.ok(scores[1]! > scores[2]!);
  assert.ok(scores.every((score) => score >= 0 && score <= 1));
});

test("calculateNewsScores scores sector keywords from titles", () => {
  const scores = calculateNewsScores(samples, [
    "白酒板块继续走强",
    "白酒消费场景回暖",
    "芯片半导体板块反弹"
  ]);
  assert.equal(scores.length, 3);
  assert.ok(scores[0]! > scores[2]!);
  assert.ok(scores[1]! > scores[2]!);
});
