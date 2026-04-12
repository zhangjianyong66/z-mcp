import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKlineCloses,
  runEtfAnalyze,
  runEtfKline,
  runEtfList,
  runEtfQuote
} from "../src/stock-data.js";
import type { EtfProviderMap } from "../src/types.js";

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
      Array.from({ length: input.limit }, (_, index) => ({
        symbol: `510${String(index).padStart(3, "0")}`,
        name: `ETF-${index}`,
        price: 1 + index,
        changePercent: index,
        changeAmount: 0.01 * index,
        volume: 100 + index,
        amount: 1000 + index
      }))
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
  assert.equal(response.count, 3);
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
