import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKlineCloses,
  runEtfAnalyze,
  runEtfBatchAnalyze,
  runEtfBatchKline,
  runEtfBatchQuote,
  runEtfKline,
  runEtfQuote,
  runSectorList
} from "../src/stock-data.js";
import type { EtfProviderMap, SectorProviderApi, SectorSnapshotItem } from "../src/types.js";

const mockProviders: EtfProviderMap = {
  xueqiu: {
    quote: async (input) => ({
      symbol: input.normalizedSymbol.code,
      name: "Mock ETF",
      price: 2,
      changePercent: 1.2,
      changeAmount: 0.03,
      open: 1.95,
      high: 2.05,
      low: 1.9,
      prevClose: 1.97,
      volume: 200,
      amount: 400,
      turnoverRate: 0.9
    }),
    kline: async (input) =>
      Array.from({ length: input.days }, (_, index) => ({
        date: `2026-03-${String(index + 1).padStart(2, "0")}`,
        open: 1 + index * 0.02,
        close: 1.02 + index * 0.02,
        high: 1.03 + index * 0.02,
        low: 0.98 + index * 0.02,
        volume: 300 + index,
        changePercent: 1
      }))
  }
};

test("runEtfQuote uses default xueqiu provider", async () => {
  const response = await runEtfQuote(
    { symbol: "159930" },
    mockProviders,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.equal(response.source, "xueqiu");
  assert.equal(response.normalizedSymbol, "SZ159930");
  assert.equal(response.generatedAt, "2026-04-12T03:30:00.000Z");
});

test("runEtfKline returns count and days metadata", async () => {
  const response = await runEtfKline(
    { symbol: "510300", days: 7 },
    mockProviders,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.equal(response.source, "xueqiu");
  assert.equal(response.days, 7);
  assert.equal(response.count, 7);
});

test("runEtfAnalyze uses default xueqiu provider and computes indicators", async () => {
  const response = await runEtfAnalyze(
    { symbol: "SZ159930", days: 30 },
    mockProviders,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.equal(response.source, "xueqiu");
  assert.equal(response.quote.name, "Mock ETF");
  assert.equal(response.recentKlines.length, 10);
  assert.ok(response.indicators.ma5 !== null);
  assert.ok(response.indicators.high30 >= response.indicators.low30);
});

test("runEtfBatchQuote returns results and errors for multiple symbols", async () => {
  const response = await runEtfBatchQuote(
    { symbols: ["159930", "510300"] },
    mockProviders,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.equal(response.source, "xueqiu");
  assert.equal(response.total, 2);
  assert.equal(response.successCount, 2);
  assert.equal(response.errorCount, 0);
  assert.equal(response.results.length, 2);
  assert.equal(response.results[0]?.symbol, "159930");
  assert.equal(response.results[1]?.symbol, "510300");
  assert.equal(response.errors.length, 0);
});

test("runEtfBatchQuote returns partial results when some symbols fail", async () => {
  const failingProviders = {
    xueqiu: {
      quote: async (input: { normalizedSymbol: { code: string } }) => {
        if (input.normalizedSymbol.code === "510300") {
          throw new Error("network error");
        }
        return mockProviders.xueqiu.quote(input as never);
      },
      kline: mockProviders.xueqiu.kline
    }
  };

  const response = await runEtfBatchQuote(
    { symbols: ["159930", "510300"] },
    failingProviders,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.equal(response.total, 2);
  assert.equal(response.successCount, 1);
  assert.equal(response.errorCount, 1);
  assert.equal(response.results[0]?.symbol, "159930");
  assert.equal(response.errors[0]?.symbol, "510300");
  assert.ok(response.errors[0]?.error.includes("xueqiu request failed"));
});

test("runEtfBatchQuote preserves input order and limits concurrency", async () => {
  let active = 0;
  let maxActive = 0;

  const delays = new Map([
    ["159930", 50],
    ["510300", 40],
    ["510050", 30],
    ["512980", 20],
    ["513100", 10],
    ["510500", 5]
  ]);

  const provider = {
    xueqiu: {
      quote: async (input: { normalizedSymbol: { code: string } }) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        try {
          await new Promise((resolve) => setTimeout(resolve, delays.get(input.normalizedSymbol.code) ?? 15));
          return mockProviders.xueqiu.quote(input as never);
        } finally {
          active -= 1;
        }
      },
      kline: mockProviders.xueqiu.kline
    }
  };

  const symbols = ["159930", "510300", "510050", "512980", "513100", "510500"];
  const response = await runEtfBatchQuote(
    { symbols },
    provider,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.equal(response.successCount, symbols.length);
  assert.equal(response.errorCount, 0);
  assert.deepEqual(response.results.map((item) => item.symbol), symbols);
  assert.ok(maxActive <= 5);
});

test("runEtfBatchQuote classifies batch errors", async () => {
  const provider = {
    xueqiu: {
      quote: async (input: { normalizedSymbol: { code: string } }) => {
        if (input.normalizedSymbol.code === "510300") {
          throw new Error("The operation was aborted due to timeout");
        }
        if (input.normalizedSymbol.code === "510050") {
          throw new Error("fetch failed");
        }
        return mockProviders.xueqiu.quote(input as never);
      },
      kline: mockProviders.xueqiu.kline
    }
  };

  const response = await runEtfBatchQuote(
    { symbols: ["159930", "510300", "510050"] },
    provider,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.equal(response.successCount, 1);
  assert.equal(response.errorCount, 2);
  assert.equal(response.errors[0]?.symbol, "510300");
  assert.equal(response.errors[0]?.code, "timeout");
  assert.equal(response.errors[0]?.retryable, true);
  assert.equal(response.errors[1]?.symbol, "510050");
  assert.equal(response.errors[1]?.code, "upstream_error");
  assert.equal(response.errors[1]?.retryable, true);
});

test("runEtfBatchKline returns results for multiple symbols", async () => {
  const response = await runEtfBatchKline(
    { symbols: ["159930", "510300"], days: 7 },
    mockProviders,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.equal(response.source, "xueqiu");
  assert.equal(response.total, 2);
  assert.equal(response.successCount, 2);
  assert.equal(response.results.length, 2);
  assert.equal(response.results[0]?.days, 7);
  assert.equal(response.results[0]?.count, 7);
});

test("runEtfBatchAnalyze returns indicators for multiple symbols", async () => {
  const response = await runEtfBatchAnalyze(
    { symbols: ["159930", "510300"], days: 30 },
    mockProviders,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.equal(response.source, "xueqiu");
  assert.equal(response.total, 2);
  assert.equal(response.successCount, 2);
  assert.equal(response.results.length, 2);
  assert.ok(response.results[0]!.indicators.ma5 !== null);
  assert.ok(response.results[1]!.indicators.ma5 !== null);
});

test("runEtfBatchAnalyze returns partial results when some symbols fail", async () => {
  const failingProviders = {
    xueqiu: {
      quote: async (input: { normalizedSymbol: { code: string } }) => {
        if (input.normalizedSymbol.code === "510300") {
          throw new Error("network error");
        }
        return mockProviders.xueqiu.quote(input as never);
      },
      kline: mockProviders.xueqiu.kline
    }
  };

  const response = await runEtfBatchAnalyze(
    { symbols: ["159930", "510300"], days: 30 },
    failingProviders,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.equal(response.total, 2);
  assert.equal(response.successCount, 1);
  assert.equal(response.errorCount, 1);
  assert.equal(response.results[0]?.symbol, "159930");
  assert.equal(response.errors[0]?.symbol, "510300");
});

test("buildKlineCloses returns close values in order", () => {
  assert.deepEqual(
    buildKlineCloses([
      {
        date: "2026-04-01",
        open: 1,
        close: 2,
        high: 2,
        low: 1,
        volume: 1,
        changePercent: 1
      },
      {
        date: "2026-04-02",
        open: 2,
        close: 3,
        high: 3,
        low: 2,
        volume: 1,
        changePercent: 1
      }
    ]),
    [2, 3]
  );
});

test("runEtfAnalyze wraps provider errors", async () => {
  await assert.rejects(
    runEtfAnalyze(
      { symbol: "159930" },
      {
        ...mockProviders,
        xueqiu: {
          quote: async () => {
            throw new Error("missing cookie");
          },
          kline: mockProviders.xueqiu.kline
        }
      }
    ),
    /xueqiu request failed: missing cookie/
  );
});

function createSectorItem(overrides: Partial<SectorSnapshotItem> = {}): SectorSnapshotItem {
  return {
    sectorName: "半导体",
    changePercent: 1.8,
    upCount: 30,
    downCount: 10,
    amount: 1200,
    netInflow: 60,
    leaderStock: "北方华创",
    leaderLatestPrice: 120,
    leaderChangePercent: 6.2,
    ...overrides
  };
}

test("runSectorList sorts by gainers and paginates", async () => {
  const provider: SectorProviderApi = {
    listIndustrySummary: async () => [
      createSectorItem({ sectorName: "医药", changePercent: -1.2 }),
      createSectorItem({ sectorName: "白酒", changePercent: 3.4 }),
      createSectorItem({ sectorName: "军工", changePercent: 0.5 })
    ]
  };

  const response = await runSectorList(
    { sortBy: "gainers", page: 1, pageSize: 2 },
    {
      provider,
      newsFetcher: async () => ["白酒板块领涨", "军工板块活跃"]
    },
    () => new Date("2026-04-23T12:00:00.000Z")
  );

  assert.equal(response.source, "akshare_ths");
  assert.equal(response.generatedAt, "2026-04-23T12:00:00.000Z");
  assert.equal(response.count, 2);
  assert.equal(response.total, 3);
  assert.equal(response.hasMore, true);
  assert.equal(response.data[0]?.sectorName, "白酒");
  assert.equal(response.data[1]?.sectorName, "军工");
});

test("runSectorList supports losers sorting", async () => {
  const provider: SectorProviderApi = {
    listIndustrySummary: async () => [
      createSectorItem({ sectorName: "医药", changePercent: -2.1 }),
      createSectorItem({ sectorName: "白酒", changePercent: 3.4 }),
      createSectorItem({ sectorName: "军工", changePercent: -0.5 })
    ]
  };

  const response = await runSectorList(
    { sortBy: "losers", page: 1, pageSize: 10 },
    {
      provider,
      newsFetcher: async () => []
    }
  );

  assert.deepEqual(response.data.map((item) => item.sectorName), ["医药", "军工", "白酒"]);
});

test("runSectorList calculates hot score with news and market components", async () => {
  const provider: SectorProviderApi = {
    listIndustrySummary: async () => [
      createSectorItem({ sectorName: "白酒", changePercent: 3.5, amount: 3000 }),
      createSectorItem({ sectorName: "半导体", changePercent: 2.0, amount: 2600 }),
      createSectorItem({ sectorName: "煤炭", changePercent: 0.2, amount: 800 })
    ]
  };

  const response = await runSectorList(
    { sortBy: "hot" },
    {
      provider,
      newsFetcher: async () => ["白酒持续活跃", "白酒消费回暖", "半导体芯片反弹"]
    }
  );

  assert.equal(response.newsScoreDegraded, false);
  assert.equal(response.data.length, 3);
  assert.ok(response.data[0]!.hotScore >= response.data[1]!.hotScore);
  assert.ok(response.data[0]!.newsScore >= response.data[1]!.newsScore);
  assert.ok(response.data.every((item) => item.hotScore >= 0 && item.hotScore <= 1));
});

test("runSectorList degrades news score when news fetch fails", async () => {
  const provider: SectorProviderApi = {
    listIndustrySummary: async () => [
      createSectorItem({ sectorName: "白酒", changePercent: 2.1, amount: 1800 }),
      createSectorItem({ sectorName: "军工", changePercent: 1.9, amount: 1500 })
    ]
  };

  const response = await runSectorList(
    { sortBy: "hot" },
    {
      provider,
      newsFetcher: async () => {
        throw new Error("news source timeout");
      }
    }
  );

  assert.equal(response.newsScoreDegraded, true);
  assert.deepEqual(response.data.map((item) => item.newsScore), [0, 0]);
});
