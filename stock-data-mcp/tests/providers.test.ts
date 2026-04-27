import test from "node:test";
import assert from "node:assert/strict";
import {
  clearXueqiuCookieCache,
  mapXueqiuQuote,
  parseXueqiuKlines,
  resolveXueqiuCookie,
  setXueqiuCookieLoaderForTests
} from "../src/providers/xueqiu.js";

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
  const rows = parseXueqiuKlines([[1712851200000, 888, 1.1, 1.3, 1.0, 1.2, 0, 1.8]]);
  assert.deepEqual(rows[0], {
    date: "2024-04-11",
    volume: 888,
    open: 1.1,
    high: 1.3,
    low: 1.0,
    close: 1.2,
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
