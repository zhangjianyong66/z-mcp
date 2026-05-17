import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHotMiningPipeline,
  normalizeChineseHotTrendsArgs,
  parseBaiduTopHtml,
  parseBilibiliPopularApiPayload,
  parseBilibiliPopularHtml,
  parseZhihuTopSearchHtml,
  runChineseHotTrends
} from "../src/chinese-hot-trends.js";
import type { HotTrendSource, ProviderMap } from "../src/types.js";

test("parseBaiduTopHtml extracts ranked public hot list items", () => {
  const html = `
    <script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"hotList":[
        {"word":"新能源汽车销量增长","url":"https://top.baidu.com/item/1","hotScore":"4820000","desc":"新能源车关注升温"},
        {"query":"AI应用爆发","rawUrl":"https://top.baidu.com/item/2","hotScore":3100000}
      ]}}}
    </script>
  `;

  const results = parseBaiduTopHtml(html, 10);

  assert.deepEqual(results, [
    {
      title: "新能源汽车销量增长",
      url: "https://top.baidu.com/item/1",
      snippet: "新能源车关注升温",
      source: "baidu",
      rank: 1,
      heat: 4_820_000,
      category: "热点发现",
      riskLevel: "low"
    },
    {
      title: "AI应用爆发",
      url: "https://top.baidu.com/item/2",
      snippet: "",
      source: "baidu",
      rank: 2,
      heat: 3_100_000,
      category: "热点发现",
      riskLevel: "low"
    }
  ]);
});

test("parseBaiduTopHtml extracts server-rendered s-data payloads", () => {
  const html = `
    <div id="sanRoot">
      <!--s-data:{"data":{"cards":[{"component":"hotList","content":[
        {"word":"中俄关系新进展","url":"https://www.baidu.com/s?wd=test","hotScore":"7904501","desc":"公开榜单摘要"}
      ]}]}}-->
    </div>
  `;

  const results = parseBaiduTopHtml(html, 3);

  assert.equal(results.length, 1);
  assert.equal(results[0]?.title, "中俄关系新进展");
  assert.equal(results[0]?.heat, 7_904_501);
});

test("parseZhihuTopSearchHtml extracts titles from embedded JSON", () => {
  const html = `
    <script id="js-initialData" type="text/json">
      {"initialState":{"topSearch":{"topSearchWords":[
        {"display_query":"如何看待大模型价格战","query":"大模型价格战","score":92},
        {"display_query":"新能源车出海","score":"81"}
      ]}}}
    </script>
  `;

  const results = parseZhihuTopSearchHtml(html, 5);

  assert.equal(results.length, 2);
  assert.equal(results[0]?.title, "如何看待大模型价格战");
  assert.equal(results[0]?.source, "zhihu");
  assert.equal(results[0]?.rank, 1);
  assert.equal(results[0]?.heat, 92);
});

test("parseZhihuTopSearchHtml extracts server-rendered DOM list", () => {
  const html = `
    <div class="TopSearchMain-item">
      <div class="TopSearchMain-index">1</div>
      <div class="TopSearchMain-title">股市</div>
      <div class="TopSearchMain-subTitle">A股市场讨论升温</div>
    </div>
  `;

  const results = parseZhihuTopSearchHtml(html, 5);

  assert.equal(results.length, 1);
  assert.equal(results[0]?.title, "股市");
  assert.equal(results[0]?.rank, 1);
  assert.equal(results[0]?.snippet, "A股市场讨论升温");
});

test("parseBilibiliPopularHtml extracts videos from initial state", () => {
  const html = `
    <script>window.__INITIAL_STATE__={"item":[
      {"title":"国产游戏新作实机演示","short_link_v2":"https://b23.tv/a","owner":{"name":"游戏UP"},"stat":{"view":123456}},
      {"title":"AI硬件体验报告","bvid":"BV123","owner":{"name":"科技UP"},"stat":{"view":"78900"}}
    ]};(function(){})</script>
  `;

  const results = parseBilibiliPopularHtml(html, 10);

  assert.equal(results.length, 2);
  assert.equal(results[0]?.snippet, "UP主：游戏UP");
  assert.equal(results[1]?.url, "https://www.bilibili.com/video/BV123");
});

test("parseBilibiliPopularApiPayload extracts videos from public popular API", () => {
  const results = parseBilibiliPopularApiPayload(
    {
      data: {
        list: [
          {
            title: "国产游戏新作实机演示",
            short_link_v2: "https://b23.tv/a",
            owner: { name: "游戏UP" },
            stat: { view: 123456 }
          }
        ]
      }
    },
    10
  );

  assert.equal(results.length, 1);
  assert.equal(results[0]?.title, "国产游戏新作实机演示");
  assert.equal(results[0]?.heat, 123456);
});

test("normalizeChineseHotTrendsArgs uses stable source defaults", () => {
  const normalized = normalizeChineseHotTrendsArgs({});

  assert.deepEqual(normalized.sources, ["baidu", "zhihu", "bilibili"]);
  assert.equal(normalized.limit, 20);
  assert.equal(normalized.verifyWithSearch, false);
});

test("runChineseHotTrends merges sources, dedupes titles, and verifies when requested", async () => {
  const providerCalls: string[] = [];
  const providers: ProviderMap = {
    aliyun: async ({ query }) => {
      providerCalls.push(query);
      return [
        {
          title: `${query} 新闻验证`,
          url: `https://news.example.com/${encodeURIComponent(query)}`,
          snippet: "验证摘要",
          provider: "aliyun"
        }
      ];
    },
    baidu: async () => [],
    ddg: async () => []
  };

  const response = await runChineseHotTrends(
    {
      sources: ["baidu", "zhihu"],
      limit: 3,
      timeoutMs: 5_000,
      verifyWithSearch: true
    },
    {
      sources: [
        {
          source: "baidu" as HotTrendSource,
          fetch: async () => [
            {
              title: "AI应用爆发",
              url: "https://top.baidu.com/item/1",
              snippet: "",
              source: "baidu",
              rank: 1,
              category: "热点发现",
              riskLevel: "low"
            }
          ]
        },
        {
          source: "zhihu" as HotTrendSource,
          fetch: async () => [
            {
              title: "AI应用爆发",
              url: "https://www.zhihu.com/search?q=AI",
              snippet: "",
              source: "zhihu",
              rank: 1,
              category: "观点讨论",
              riskLevel: "medium"
            },
            {
              title: "新能源车出海",
              url: "https://www.zhihu.com/search?q=car",
              snippet: "",
              source: "zhihu",
              rank: 2,
              category: "观点讨论",
              riskLevel: "medium"
            }
          ]
        }
      ],
      providers,
      now: () => new Date("2026-05-17T08:00:00.000Z")
    }
  );

  assert.equal(response.count, 2);
  assert.deepEqual(response.sourceStats, { baidu: 1, zhihu: 1 });
  assert.equal(response.trends[0]?.sources.length, 2);
  assert.equal(response.trends[0]?.verification?.length, 1);
  assert.deepEqual(providerCalls, ["AI应用爆发", "新能源车出海"]);
});

test("buildHotMiningPipeline combines discovery, verification, industry and long-tail sections", async () => {
  const response = await buildHotMiningPipeline(
    {
      limit: 2,
      timeoutMs: 5_000,
      sources: ["baidu"],
      includeIndustry: true,
      includeLongTail: true
    },
    {
      trends: async () => ({
        generatedAt: "2026-05-17T08:00:00.000Z",
        count: 1,
        trends: [
          {
            title: "AI应用爆发",
            url: "https://top.baidu.com/item/1",
            snippet: "",
            rank: 1,
            heat: 100,
            category: "热点发现",
            riskLevel: "low",
            sources: ["baidu"]
          }
        ],
        sourceStats: { baidu: 1 },
        queryMode: "public-hot-list"
      }),
      financeHotnews: async () => ({
        generatedAt: "2026-05-17T08:00:00.000Z",
        count: 1,
        news: [
          {
            title: "半导体产业新闻",
            url: "https://finance.example.com/1",
            snippet: "",
            source: "财经源",
            type: "direct"
          }
        ],
        sourceStats: { direct: 1, search: 0 },
        queryMode: "fixed-hotnews"
      }),
      search: async () => [
        {
          title: "GitHub Trending AI项目",
          url: "https://github.com/trending",
          snippet: "",
          provider: "ddg"
        }
      ],
      now: () => new Date("2026-05-17T08:00:00.000Z")
    }
  );

  assert.equal(response.discovery.count, 1);
  assert.equal(response.industry?.count, 1);
  assert.equal(response.longTail?.count, 1);
  assert.equal(response.queryMode, "hot-mining-pipeline");
});
