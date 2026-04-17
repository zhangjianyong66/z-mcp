import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKlineCloses,
  runEtfAnalyze,
  runEtfKline,
  runEtfList,
  runEtfQuote
} from "../src/stock-data.js";
import type { EtfListItem, EtfProviderMap } from "../src/types.js";

function createListItem(overrides: Partial<EtfListItem> = {}): EtfListItem {
  return {
    symbol: "510300",
    name: "沪深300ETF",
    market: "SH" as const,
    normalizedSymbol: "SH510300",
    secid: "1.510300",
    price: 4.2,
    changePercent: 1.2,
    changeAmount: 0.05,
    volume: 100,
    amount: 200,
    open: 4.1,
    high: 4.3,
    low: 4.0,
    prevClose: 4.15,
    amplitude: 2,
    turnoverRate: 0.78,
    volumeRatio: 1.1,
    peRatio: 12.3,
    pbRatio: 1.5,
    totalMarketValue: 123456789,
    circulationMarketValue: 98765432,
    change60d: 4.1,
    changeYtd: 7.8,
    ...overrides
  };
}

const mockProviders: EtfProviderMap = {
  eastmoney: {
    quote: async (input) => ({
      symbol: input.normalizedSymbol.code,
      name: "Mock ETF",
      price: 1.23,
      changePercent: 0.5,
      changeAmount: 0.01,
      open: 1.2,
      high: 1.25,
      low: 1.19,
      prevClose: 1.22,
      volume: 100,
      amount: 200
    }),
    kline: async (input) =>
      Array.from({ length: input.days }, (_, index) => ({
        date: `2026-04-${String(index + 1).padStart(2, "0")}`,
        open: 1 + index * 0.01,
        close: 1.01 + index * 0.01,
        high: 1.02 + index * 0.01,
        low: 0.99 + index * 0.01,
        volume: 100 + index,
        changePercent: 0.5
      })),
    list: async (input) =>
      {
        const total = 5;
        const start = (input.page - 1) * input.pageSize;
        const length = Math.max(0, Math.min(input.pageSize, total - start));
        return {
          total,
          items: Array.from({ length }, (_, index) => {
            const globalIndex = start + index;
          return {
            symbol: `510${String(globalIndex).padStart(3, "0")}`,
            name: `ETF-${globalIndex}`,
            market: "SH" as const,
            normalizedSymbol: `SH510${String(globalIndex).padStart(3, "0")}`,
              secid: `1.510${String(globalIndex).padStart(3, "0")}`,
    price: 1 + index,
    changePercent: 5 - globalIndex,
    changeAmount: 0.01 * index,
    volume: 100 + index,
    amount: 1000 + index,
              open: 0.9 + index,
              high: 1.1 + index,
              low: 0.8 + index,
              prevClose: 0.95 + index,
              amplitude: 2 + index,
              turnoverRate: 0.5 + index,
              volumeRatio: 1 + index,
              peRatio: 10 + index,
              pbRatio: 1.2 + index,
              totalMarketValue: 1000000 + index,
              circulationMarketValue: 800000 + index,
              change60d: 3 + index,
              changeYtd: 5 + index
            };
          })
        };
      }
  },
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

test("runEtfQuote uses default eastmoney provider", async () => {
  const response = await runEtfQuote(
    { symbol: "159930" },
    mockProviders,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.equal(response.source, "eastmoney");
  assert.equal(response.normalizedSymbol, "SZ159930");
  assert.equal(response.generatedAt, "2026-04-12T03:30:00.000Z");
});

test("runEtfKline returns count and days metadata", async () => {
  const response = await runEtfKline(
    { symbol: "510300", days: 7 },
    mockProviders,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.equal(response.source, "eastmoney");
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

test("runEtfList uses eastmoney list capability", async () => {
  const response = await runEtfList(
    { limit: 3 },
    mockProviders,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.equal(response.source, "eastmoney");
  assert.equal(response.sourceUrl, "https://quote.eastmoney.com/center/gridlist.html#fund_etf");
  assert.deepEqual(response.sourceQuery, {
    page: 1,
    pageSize: 3,
    sortBy: "gainers"
  });
  assert.equal(response.count, 3);
  assert.equal(response.data[0]?.normalizedSymbol, "SH510000");
  assert.equal(response.data[0]?.turnoverRate, 0.5);
  assert.equal(response.total, 5);
  assert.equal(response.hasMore, true);
  assert.equal(response.pageSize, 3);
});

test("runEtfList applies limit alias and preserves requested page", async () => {
  const calls: Array<{ page: number; pageSize: number }> = [];
  const providers: EtfProviderMap = {
    ...mockProviders,
    eastmoney: {
      ...mockProviders.eastmoney,
      list: async (input) => {
        calls.push({ page: input.page, pageSize: input.pageSize });
        return {
          total: 10,
          items: [createListItem({ symbol: `51030${input.page}`, normalizedSymbol: `SH51030${input.page}` })]
        };
      }
    }
  };

  const response = await runEtfList(
    { limit: 4, page: 3 },
    providers,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.deepEqual(calls, [{ page: 3, pageSize: 4 }]);
  assert.equal(response.page, 3);
  assert.equal(response.pageSize, 4);
  assert.equal(response.limit, 4);
  assert.equal(response.count, 1);
});

test("runEtfList defaults limit to pageSize when pageSize is omitted", async () => {
  const calls: Array<{ page: number; pageSize: number }> = [];
  const providers: EtfProviderMap = {
    ...mockProviders,
    eastmoney: {
      ...mockProviders.eastmoney,
      list: async (input) => {
        calls.push({ page: input.page, pageSize: input.pageSize });
        return {
          total: 1,
          items: [createListItem()]
        };
      }
    }
  };

  const response = await runEtfList(
    { limit: 7 },
    providers,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.deepEqual(calls, [{ page: 1, pageSize: 7 }]);
  assert.equal(response.pageSize, 7);
  assert.equal(response.limit, 7);
});

test("runEtfList supports losers sort", async () => {
  const response = await runEtfList(
    { limit: 5, sortBy: "losers" },
    mockProviders,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.equal(response.data[0]?.changePercent, 1);
  assert.equal(response.data.at(-1)?.changePercent, 5);
});

test("runEtfList supports volume amount and turnoverRate sorting", async () => {
  const providers: EtfProviderMap = {
    ...mockProviders,
    eastmoney: {
      ...mockProviders.eastmoney,
      list: async (input) => {
        const items = [
          createListItem({
            symbol: "510001",
            normalizedSymbol: "SH510001",
            volume: 300,
            amount: 900,
            turnoverRate: 1.2
          }),
          createListItem({
            symbol: "510002",
            normalizedSymbol: "SH510002",
            volume: 100,
            amount: 1200,
            turnoverRate: 0.5
          }),
          createListItem({
            symbol: "510003",
            normalizedSymbol: "SH510003",
            volume: 200,
            amount: 600,
            turnoverRate: 2.4
          })
        ];
        return {
          total: items.length,
          items
        };
      }
    }
  };

  const volume = await runEtfList({ pageSize: 10, sortBy: "volume" }, providers);
  assert.deepEqual(volume.data.map((item) => item.symbol), ["510001", "510003", "510002"]);

  const amount = await runEtfList({ pageSize: 10, sortBy: "amount" }, providers);
  assert.deepEqual(amount.data.map((item) => item.symbol), ["510002", "510001", "510003"]);

  const turnoverRate = await runEtfList({ pageSize: 10, sortBy: "turnoverRate" }, providers);
  assert.deepEqual(turnoverRate.data.map((item) => item.symbol), ["510003", "510001", "510002"]);
});

test("runEtfList fetchAll aggregates every page", async () => {
  const pages: number[] = [];
  const providers: EtfProviderMap = {
    ...mockProviders,
    eastmoney: {
      ...mockProviders.eastmoney,
      list: async (input) => {
        pages.push(input.page);
        const total = 5;
        const start = (input.page - 1) * input.pageSize;
        const length = Math.max(0, Math.min(input.pageSize, total - start));
        return {
          total,
          items: Array.from({ length }, (_, index) => {
            const globalIndex = start + index;
            return createListItem({
              symbol: `510${String(globalIndex).padStart(3, "0")}`,
              normalizedSymbol: `SH510${String(globalIndex).padStart(3, "0")}`
            });
          })
        };
      }
    }
  };

  const response = await runEtfList(
    { pageSize: 2, fetchAll: true },
    providers,
    () => new Date("2026-04-12T03:30:00.000Z")
  );

  assert.equal(response.fetchAll, true);
  assert.equal(response.count, 5);
  assert.equal(response.total, 5);
  assert.equal(response.hasMore, false);
  assert.equal(response.data.length, 5);
  assert.deepEqual(pages, [1, 2, 3]);
});

test("runEtfList wraps provider errors with eastmoney prefix", async () => {
  await assert.rejects(
    runEtfList(
      { limit: 3, source: "eastmoney" },
      {
        ...mockProviders,
        eastmoney: {
          ...mockProviders.eastmoney,
          list: async () => {
            throw new Error("fetch failed");
          }
        }
      }
    ),
    /eastmoney request failed: fetch failed/
  );
});

test("runEtfList falls back to sse when eastmoney fails in auto mode", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        result: [
          {
            FUND_CODE: "510010",
            FUND_ABBR: "治理ETF",
            SCALE: "2.4246"
          }
        ],
        pageHelp: {
          total: 1
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    ) as Response;

  try {
    const response = await runEtfList(
      { limit: 3 },
      {
        ...mockProviders,
        eastmoney: {
          ...mockProviders.eastmoney,
          list: async () => {
            throw new Error("fetch failed");
          }
        }
      }
    );

  assert.equal(response.source, "sse");
  assert.equal(response.sourceUrl, "https://english.sse.com.cn/access/etf/");
  assert.deepEqual(response.sourceQuery, {
    page: 1,
    pageSize: 3,
    sortBy: "gainers"
  });
  assert.equal(response.count, 1);
    assert.equal(response.data[0]?.symbol, "510010");
    assert.equal(response.data[0]?.name, "治理ETF");
    assert.equal(response.total, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
