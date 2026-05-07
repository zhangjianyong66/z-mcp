import test from "node:test";
import assert from "node:assert/strict";
import {
  clearXueqiuCookieCache,
  createXueqiuProvider,
  mapXueqiuQuote,
  parseXueqiuKlines,
  resolveXueqiuCookie,
  setXueqiuFetchForTests,
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

test("xueqiu provider retries once after 401 with auto cookie", async () => {
  const previous = process.env.XUEQIU_COOKIE;
  delete process.env.XUEQIU_COOKIE;
  clearXueqiuCookieCache();

  const loadedCookies = ["xq_a_token=old_cookie", "xq_a_token=new_cookie"];
  let loaderCalls = 0;
  setXueqiuCookieLoaderForTests(async () => {
    const value = loadedCookies[Math.min(loaderCalls, loadedCookies.length - 1)]!;
    loaderCalls += 1;
    return value;
  });

  const seenCookies: string[] = [];
  let fetchCalls = 0;
  setXueqiuFetchForTests(async (_url, init) => {
    fetchCalls += 1;
    const headers = init?.headers as Record<string, string> | undefined;
    seenCookies.push(headers?.Cookie ?? "");
    if (fetchCalls === 1) {
      return {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({})
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ data: { name: "沪深300ETF", current: 1.23 } })
    } as Response;
  });

  try {
    const provider = createXueqiuProvider();
    const quote = await provider.quote({
      symbol: "510300",
      provider: "xueqiu",
      timeoutMs: 10_000,
      normalizedSymbol: { code: "510300", market: "SH", prefixed: "SH510300", secid: "1.510300" }
    });
    assert.equal(quote.price, 1.23);
    assert.equal(fetchCalls, 2);
    assert.equal(loaderCalls, 2);
    assert.deepEqual(seenCookies, ["xq_a_token=old_cookie", "xq_a_token=new_cookie"]);
  } finally {
    if (previous === undefined) {
      delete process.env.XUEQIU_COOKIE;
    } else {
      process.env.XUEQIU_COOKIE = previous;
    }
    setXueqiuFetchForTests();
    setXueqiuCookieLoaderForTests();
  }
});

test("xueqiu provider returns actionable error for env cookie on 401", async () => {
  const previous = process.env.XUEQIU_COOKIE;
  process.env.XUEQIU_COOKIE = "xq_a_token=env_cookie";
  clearXueqiuCookieCache();

  let fetchCalls = 0;
  setXueqiuFetchForTests(async () => {
    fetchCalls += 1;
    return {
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({})
    } as Response;
  });

  try {
    const provider = createXueqiuProvider();
    const error = await provider.quote({
      symbol: "510300",
      provider: "xueqiu",
      timeoutMs: 10_000,
      normalizedSymbol: { code: "510300", market: "SH", prefixed: "SH510300", secid: "1.510300" }
    }).then(
      () => null,
      (reason: unknown) => reason
    );

    assert.ok(error instanceof Error);
    assert.match(error.message, /Please refresh XUEQIU_COOKIE/);
    const details = (error as Error & { details?: Record<string, unknown> }).details;
    assert.equal(details?.cookieSource, "env");
    assert.equal(details?.refreshed, false);
    assert.equal(fetchCalls, 1);
  } finally {
    if (previous === undefined) {
      delete process.env.XUEQIU_COOKIE;
    } else {
      process.env.XUEQIU_COOKIE = previous;
    }
    setXueqiuFetchForTests();
  }
});

test("xueqiu provider does not call fallback name endpoint when quote already has name", async () => {
  const previous = process.env.XUEQIU_COOKIE;
  process.env.XUEQIU_COOKIE = "xq_a_token=env_cookie";
  clearXueqiuCookieCache();

  const seenUrls: string[] = [];
  setXueqiuFetchForTests(async (url) => {
    seenUrls.push(String(url));
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ data: { name: "沪深300ETF", current: 1.23 } })
    } as Response;
  });

  try {
    const provider = createXueqiuProvider();
    const quote = await provider.quote({
      symbol: "510300",
      provider: "xueqiu",
      timeoutMs: 10_000,
      normalizedSymbol: { code: "510300", market: "SH", prefixed: "SH510300", secid: "1.510300" }
    });
    assert.equal(quote.name, "沪深300ETF");
    assert.equal(seenUrls.length, 1);
    assert.match(seenUrls[0]!, /\/v5\/stock\/realtime\/quotec\.json/);
  } finally {
    if (previous === undefined) {
      delete process.env.XUEQIU_COOKIE;
    } else {
      process.env.XUEQIU_COOKIE = previous;
    }
    setXueqiuFetchForTests();
    clearXueqiuCookieCache();
  }
});

test("xueqiu provider fills name from quote detail fallback when realtime quote has no name", async () => {
  const previous = process.env.XUEQIU_COOKIE;
  process.env.XUEQIU_COOKIE = "xq_a_token=env_cookie";
  clearXueqiuCookieCache();

  setXueqiuFetchForTests(async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/v5/stock/realtime/quotec.json")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ data: { current: 1.23 } })
      } as Response;
    }
    if (requestUrl.includes("/v5/stock/quote.json")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ data: { quote: { name: "豆粕ETF" } } })
      } as Response;
    }
    throw new Error(`unexpected url: ${requestUrl}`);
  });

  try {
    const provider = createXueqiuProvider();
    const quote = await provider.quote({
      symbol: "159985",
      provider: "xueqiu",
      timeoutMs: 10_000,
      normalizedSymbol: { code: "159985", market: "SZ", prefixed: "SZ159985", secid: "0.159985" }
    });
    assert.equal(quote.name, "豆粕ETF");
  } finally {
    if (previous === undefined) {
      delete process.env.XUEQIU_COOKIE;
    } else {
      process.env.XUEQIU_COOKIE = previous;
    }
    setXueqiuFetchForTests();
    clearXueqiuCookieCache();
  }
});

test("xueqiu provider falls back to suggest endpoint when detail endpoint does not provide name", async () => {
  const previous = process.env.XUEQIU_COOKIE;
  process.env.XUEQIU_COOKIE = "xq_a_token=env_cookie";
  clearXueqiuCookieCache();

  setXueqiuFetchForTests(async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes("/v5/stock/realtime/quotec.json")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ data: { current: 1.23 } })
      } as Response;
    }
    if (requestUrl.includes("/v5/stock/quote.json")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ data: { quote: {} } })
      } as Response;
    }
    if (requestUrl.includes("/query/v1/suggest_stock.json")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ data: [{ symbol: "SZ159985", name: "豆粕ETF" }] })
      } as Response;
    }
    throw new Error(`unexpected url: ${requestUrl}`);
  });

  try {
    const provider = createXueqiuProvider();
    const quote = await provider.quote({
      symbol: "159985",
      provider: "xueqiu",
      timeoutMs: 10_000,
      normalizedSymbol: { code: "159985", market: "SZ", prefixed: "SZ159985", secid: "0.159985" }
    });
    assert.equal(quote.name, "豆粕ETF");
  } finally {
    if (previous === undefined) {
      delete process.env.XUEQIU_COOKIE;
    } else {
      process.env.XUEQIU_COOKIE = previous;
    }
    setXueqiuFetchForTests();
    clearXueqiuCookieCache();
  }
});
