import test from "node:test";
import assert from "node:assert/strict";
import {
  createEastmoneyProvider,
  extractEastmoneyListPage,
  extractEastmoneyListRows,
  mapEastmoneyListItem,
  mapEastmoneyQuote,
  parseEastmoneyKlines
} from "../src/providers/eastmoney.js";
import { createSseProvider } from "../src/providers/sse.js";
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
      f43: 4757,
      f170: 38,
      f169: 18,
      f46: 4735,
      f44: 4777,
      f45: 4728,
      f60: 4739,
      f47: 999,
      f48: 888
    },
    "159930"
  );

  assert.equal(quote.name, "能源ETF");
  assert.equal(quote.price, 4.757);
  assert.equal(quote.changePercent, 0.38);
  assert.equal(quote.changeAmount, 0.018);
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
    f2: 4200,
    f3: 120,
    f4: 50,
    f5: 100,
    f6: 200,
    f7: 250,
    f8: 78,
    f9: 12.3,
    f10: 110,
    f15: 4300,
    f16: 4100,
    f17: 4180,
    f18: 4120,
    f20: 1234567890,
    f21: 987654321,
    f23: 1.8,
    f24: 890,
    f25: 1520
  });

  assert.equal(item.symbol, "510300");
  assert.equal(item.name, "沪深300ETF");
  assert.equal(item.price, 4.2);
  assert.equal(item.market, "SH");
  assert.equal(item.normalizedSymbol, "SH510300");
  assert.equal(item.turnoverRate, 0.78);
  assert.equal(item.open, 4.18);
  assert.equal(item.high, 4.3);
  assert.equal(item.low, 4.1);
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

test("extractEastmoneyListPage keeps total metadata", () => {
  const page = extractEastmoneyListPage({
    rc: 0,
    data: {
      total: 42,
      diff: [
        {
          f12: "510300",
          f14: "沪深300ETF"
        }
      ]
    }
  });

  assert.equal(page.total, 42);
  assert.equal(page.items.length, 1);
});

test("eastmoney list sends expected paging and sort parameters", async () => {
  const previousFetch = globalThis.fetch;
  const requests: Array<{ url: string; signal: AbortSignal | undefined }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: String(input),
      signal: init?.signal as AbortSignal | undefined
    });
    return new Response(
      JSON.stringify({
        rc: 0,
        data: {
          total: 1,
          diff: [
            {
              f12: "510300",
              f14: "沪深300ETF",
              f2: 4.2,
              f3: 1.2,
              f4: 0.05,
              f5: 100,
              f6: 200
            }
          ]
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  }) as typeof fetch;

  try {
    const provider = createEastmoneyProvider();
    const list = provider.list;
    assert.ok(list);
    const result = await list(
      {
        page: 2,
        pageSize: 25,
        limit: 25,
        sortBy: "amount",
        fetchAll: false,
        source: "auto",
        timeoutMs: 15_000
      },
      { requestId: "request-1" }
    );

    assert.equal(requests.length, 1);
    assert.match(requests[0]?.url ?? "", /pn=2/);
    assert.match(requests[0]?.url ?? "", /pz=25/);
    assert.match(requests[0]?.url ?? "", /po=1/);
    assert.match(requests[0]?.url ?? "", /fid=f6/);
    assert.match(requests[0]?.url ?? "", /fltt=1/);
    assert.match(requests[0]?.url ?? "", /fs=b%3AMK0021%2Cb%3AMK0022%2Cb%3AMK0023%2Cb%3AMK0024%2Cb%3AMK0827/);
    assert.match(requests[0]?.url ?? "", /fields=.*f12.*f14.*f15.*f16.*f17.*f18/);
    assert.equal(result.total, 1);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.symbol, "510300");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("sse list maps base ETF metadata fields", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        result: [
          {
            FUND_CODE: "510010",
            FUND_ABBR: "治理ETF",
            FUND_EXPANSION_ABBR: "180治理ETF交银",
            COMPANY_NAME: "交银施罗德基金管理有限公司",
            COMPANY_CODE: "900728",
            INDEX_NAME: "上证180公司治理指数",
            LISTING_DATE: "2009-12-15",
            CATEGORY: "F111",
            SCALE: "2.4246"
          }
        ],
        pageHelp: {
          total: 845
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    )) as typeof fetch;

  try {
    const provider = createSseProvider();
    const list = provider.list;
    assert.ok(list);
    const result = await list(
      {
        page: 1,
        pageSize: 25,
        limit: 25,
        sortBy: "gainers",
        fetchAll: false,
        source: "sse",
        timeoutMs: 15_000
      },
      { requestId: "request-1" }
    );

    assert.equal(result.total, 845);
    assert.equal(result.items[0]?.symbol, "510010");
    assert.equal(result.items[0]?.fundAbbr, "治理ETF");
    assert.equal(result.items[0]?.fundExpansionAbbr, "180治理ETF交银");
    assert.equal(result.items[0]?.companyName, "交银施罗德基金管理有限公司");
    assert.equal(result.items[0]?.companyCode, "900728");
    assert.equal(result.items[0]?.indexName, "上证180公司治理指数");
    assert.equal(result.items[0]?.listingDate, "2009-12-15");
    assert.equal(result.items[0]?.category, "F111");
    assert.equal(result.items[0]?.scale, 2.4246);
  } finally {
    globalThis.fetch = previousFetch;
  }
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
