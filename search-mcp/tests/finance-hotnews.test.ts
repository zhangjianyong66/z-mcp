import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFinanceHotnewsResponse,
  dedupeFinanceHotnews,
  extractHotSectors,
  normalizeFinanceHotnewsArgs,
  parse10jqkaHtml,
  parseSinaFinanceHtml,
  runFinanceHotnews
} from "../src/finance-hotnews.js";
import type { FinanceHotnewsItem, ProviderMap } from "../src/types.js";

test("normalizeFinanceHotnewsArgs applies stable defaults", () => {
  const normalized = normalizeFinanceHotnewsArgs();

  assert.deepEqual(normalized, {
    limit: 15,
    timeoutMs: 30_000,
    includeSectors: true,
    searchFallback: true
  });
});

test("parseSinaFinanceHtml extracts unique direct items", () => {
  const html = `
    <a href="https://finance.sina.com.cn/stock/test-1.shtml">AI芯片板块强势拉升带动半导体走高</a>
    <a href="https://finance.sina.com.cn/stock/test-1.shtml">AI芯片板块强势拉升带动半导体走高</a>
    <a href="https://stock.finance.sina.com.cn/stock/test-2.shtml">新能源车与锂电池板块午后继续走强</a>
  `;

  const results = parseSinaFinanceHtml(html);

  assert.equal(results.length, 2);
  assert.equal(results[0]?.source, "新浪财经");
  assert.equal(results[0]?.type, "direct");
});

test("parse10jqkaHtml normalizes relative URLs and titles", () => {
  const html = `
    <a href="/news/20260412/c123456789.shtml" title="黄金与石油板块集体上涨带动周期股反弹"></a>
    <a href="https://www.10jqka.com.cn/news/20260412/c987654321.shtml" title="黄金与石油板块集体上涨带动周期股反弹"></a>
  `;

  const results = parse10jqkaHtml(html);

  assert.equal(results.length, 1);
  assert.equal(results[0]?.url, "https://www.10jqka.com.cn/news/20260412/c123456789.shtml");
  assert.equal(results[0]?.source, "同花顺");
});

test("dedupeFinanceHotnews removes duplicates by URL and title", () => {
  const items: FinanceHotnewsItem[] = [
    {
      title: "A股AI板块继续升温",
      url: "https://example.com/news/1",
      snippet: "",
      source: "新浪财经",
      type: "direct"
    },
    {
      title: "A股AI板块继续升温",
      url: "https://example.com/news/2",
      snippet: "",
      source: "ddg",
      type: "search"
    },
    {
      title: "半导体午后拉升",
      url: "https://example.com/news/1",
      snippet: "",
      source: "同花顺",
      type: "direct"
    }
  ];

  assert.equal(dedupeFinanceHotnews(items).length, 1);
});

test("extractHotSectors counts configured keyword matches", () => {
  const sectors = extractHotSectors([
    {
      title: "AI与半导体板块共振走高",
      url: "https://example.com/1",
      snippet: "大模型和芯片概念持续活跃",
      source: "新浪财经",
      type: "direct"
    }
  ]);

  assert.ok(sectors.some((sector) => sector.name === "AI" && sector.score === 2));
  assert.ok(sectors.some((sector) => sector.name === "半导体" && sector.score === 2));
});

test("buildFinanceHotnewsResponse omits optional fields when disabled or empty", () => {
  const response = buildFinanceHotnewsResponse(
    {
      limit: 5,
      timeoutMs: 5_000,
      includeSectors: false,
      searchFallback: true
    },
    [],
    [],
    "2026-04-12T03:30:00.000Z"
  );

  assert.equal(response.hotSectors, undefined);
  assert.equal(response.partialFailures, undefined);
});

test("runFinanceHotnews returns direct-first results and partial failures with fallback", async () => {
  const providers: ProviderMap = {
    aliyun: async () => {
      throw new Error("missing key");
    },
    baidu: async () => [],
    ddg: async () => [
      {
        title: "机器人与AI板块联动走强",
        url: "https://example.com/search/1",
        snippet: "机器人概念和AI概念同步上涨",
        provider: "ddg"
      }
    ]
  };

  const response = await runFinanceHotnews(
    {
      limit: 3,
      timeoutMs: 8_000,
      includeSectors: true,
      searchFallback: true
    },
    {
      directSources: [
        {
          name: "新浪财经",
          fetch: async () => [
            {
              title: "半导体与AI主线继续活跃",
              url: "https://example.com/direct/1",
              snippet: "",
              source: "新浪财经",
              type: "direct"
            }
          ]
        },
        {
          name: "同花顺",
          fetch: async () => {
            throw new Error("source unavailable");
          }
        }
      ],
      providers,
      now: () => new Date("2026-04-12T03:30:00.000Z")
    }
  );

  assert.equal(response.count, 2);
  assert.deepEqual(response.sourceStats, { direct: 1, search: 1 });
  assert.equal(response.news[0]?.type, "direct");
  assert.equal(response.news[1]?.type, "search");
  assert.equal(response.queryMode, "fixed-hotnews");
  assert.ok(response.partialFailures?.some((item) => item.source === "同花顺"));
  assert.ok(response.partialFailures?.some((item) => item.source === "aliyun"));
});

test("runFinanceHotnews throws when all sources fail", async () => {
  const providers: ProviderMap = {
    aliyun: async () => {
      throw new Error("aliyun down");
    },
    baidu: async () => {
      throw new Error("baidu down");
    },
    ddg: async () => {
      throw new Error("ddg down");
    }
  };

  await assert.rejects(
    runFinanceHotnews(
      {
        limit: 2,
        timeoutMs: 5_000,
        includeSectors: true,
        searchFallback: true
      },
      {
        directSources: [
          {
            name: "新浪财经",
            fetch: async () => {
              throw new Error("sina down");
            }
          }
        ],
        providers
      }
    ),
    /finance_hotnews failed:/
  );
});
