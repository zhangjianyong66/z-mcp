import test from "node:test";
import assert from "node:assert/strict";
import {
  extractEastmoneyListRows,
  mapEastmoneyListItem,
  mapEastmoneyQuote,
  parseEastmoneyKlines
} from "../src/providers/eastmoney.js";
import {
  clearXueqiuCookieCache,
  mapXueqiuQuote,
  parseXueqiuKlines,
  resolveXueqiuCookie,
  setXueqiuCookieLoaderForTests
} from "../src/providers/xueqiu.js";

test("mapEastmoneyQuote scales quote fields", () => {
  const quote = mapEastmoneyQuote(
    {
      f58: "能源ETF",
      f43: 123,
      f170: 145,
      f169: 12,
      f46: 120,
      f44: 130,
      f45: 118,
      f60: 111,
      f47: 999,
      f48: 888
    },
    "159930"
  );

  assert.equal(quote.name, "能源ETF");
  assert.equal(quote.price, 1.23);
  assert.equal(quote.changePercent, 1.45);
  assert.equal(quote.changeAmount, 0.12);
});

test("parseEastmoneyKlines maps CSV rows", () => {
  const rows = parseEastmoneyKlines(["2026-04-12,1.1,1.2,1.3,1.0,1000,0,0,2.5"]);
  assert.deepEqual(rows[0], {
    date: "2026-04-12",
    open: 1.1,
    close: 1.2,
    high: 1.3,
    low: 1,
    volume: 1000,
    changePercent: 2.5
  });
});

test("mapEastmoneyListItem keeps ETF list fields", () => {
  const item = mapEastmoneyListItem({
    f12: "510300",
    f14: "沪深300ETF",
    f2: 4.2,
    f3: 1.2,
    f4: 0.05,
    f5: 100,
    f6: 200
  });

  assert.equal(item.symbol, "510300");
  assert.equal(item.name, "沪深300ETF");
  assert.equal(item.price, 4.2);
});

test("extractEastmoneyListRows throws on non-zero rc", () => {
  assert.throws(
    () =>
      extractEastmoneyListRows({
        rc: 102,
        data: null
      }),
    /list API returned rc=102/
  );
});

test("extractEastmoneyListRows throws on null data", () => {
  assert.throws(
    () =>
      extractEastmoneyListRows({
        rc: 0,
        data: null
      }),
    /list API returned null or empty data/
  );
});

test("mapXueqiuQuote keeps direct quote fields", () => {
  const quote = mapXueqiuQuote(
    {
      name: "沪深300ETF",
      current: 4.123,
      percent: 1.23,
      chg: 0.05,
      open: 4.08,
      high: 4.15,
      low: 4.02,
      last_close: 4.07,
      volume: 1000,
      amount: 3000,
      turnover_rate: 0.8
    },
    "510300"
  );

  assert.equal(quote.price, 4.123);
  assert.equal(quote.turnoverRate, 0.8);
});

test("parseXueqiuKlines converts timestamps to ISO date", () => {
  const rows = parseXueqiuKlines([[1712851200000, 1.1, 1.2, 1.3, 1.0, 888, 0, 1.8]]);
  assert.deepEqual(rows[0], {
    date: "2024-04-11",
    open: 1.1,
    close: 1.2,
    high: 1.3,
    low: 1,
    volume: 888,
    changePercent: 1.8
  });
});

test("resolveXueqiuCookie prefers environment variable cookie", async () => {
  const previous = process.env.XUEQIU_COOKIE;
  process.env.XUEQIU_COOKIE = "xq_a_token=env_cookie";
  setXueqiuCookieLoaderForTests(async () => "xq_a_token=loader_cookie");

  try {
    const cookie = await resolveXueqiuCookie();
    assert.equal(cookie, "xq_a_token=env_cookie");
  } finally {
    if (previous === undefined) {
      delete process.env.XUEQIU_COOKIE;
    } else {
      process.env.XUEQIU_COOKIE = previous;
    }
    setXueqiuCookieLoaderForTests();
  }
});

test("resolveXueqiuCookie caches auto-loaded cookie", async () => {
  const previous = process.env.XUEQIU_COOKIE;
  delete process.env.XUEQIU_COOKIE;
  clearXueqiuCookieCache();

  let calls = 0;
  setXueqiuCookieLoaderForTests(async () => {
    calls += 1;
    return "xq_a_token=auto_cookie";
  });

  try {
    const first = await resolveXueqiuCookie();
    const second = await resolveXueqiuCookie();
    assert.equal(first, "xq_a_token=auto_cookie");
    assert.equal(second, "xq_a_token=auto_cookie");
    assert.equal(calls, 1);
  } finally {
    if (previous === undefined) {
      delete process.env.XUEQIU_COOKIE;
    } else {
      process.env.XUEQIU_COOKIE = previous;
    }
    setXueqiuCookieLoaderForTests();
  }
});
