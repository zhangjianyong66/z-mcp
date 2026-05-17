import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  buildHotMiningPipeline,
  normalizeChineseHotTrendsArgs,
  normalizeHotMiningPipelineArgs,
  runChineseHotTrends
} from "./chinese-hot-trends.js";
import {
  normalizeFinanceHotnewsArgs,
  runFinanceHotnews
} from "./finance-hotnews.js";
import { buildSearchResponse, normalizeSearchArgs, runSearch } from "./search.js";

function toToolError(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text",
        text: message
      }
    ],
    isError: true
  };
}

const server = new McpServer({
  name: "search-mcp",
  version: "0.1.0"
});

server.tool(
  "web_search",
  "使用选定的搜索提供商进行网页搜索。支持的提供商有 aliyun、baidu 和 ddg。未指定提供商时，默认使用 aliyun。",
  {
    query: z.string().min(1).describe("Search query."),
    provider: z
      .enum(["aliyun", "baidu", "ddg"])
      .optional()
      .describe("Optional search provider. Defaults to aliyun."),
    limit: z.number().int().min(1).max(20).optional().describe("Optional max result count. Defaults to 10."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds. Defaults to 30.")
  },
  async ({ query, provider, limit, timeout }) => {
    try {
      const input = normalizeSearchArgs({ query, provider, limit, timeout });
      const results = await runSearch(input);
      const response = buildSearchResponse(input.provider, input.query, results);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "finance_hotnews",
  "获取当前财经热闻，优先使用直接来源，不足时回退到搜索提供商。返回结构化 JSON，无副作用。",
  {
    limit: z.number().int().min(1).max(30).optional().describe("Optional max hot news count. Defaults to 15."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds. Defaults to 30."),
    include_sectors: z.boolean().optional().describe("Whether to include sector heat extraction. Defaults to true."),
    search_fallback: z.boolean().optional().describe("Whether to use search-provider fallback when direct sources are insufficient. Defaults to true.")
  },
  async ({ limit, timeout, include_sectors, search_fallback }) => {
    try {
      const input = normalizeFinanceHotnewsArgs({
        limit,
        timeout,
        include_sectors,
        search_fallback
      });
      const response = await runFinanceHotnews(input);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "chinese_hot_trends",
  "聚合中文互联网公开热点榜单，优先使用百度热搜、知乎热搜和 B 站热门。可选搜索验证，返回结构化 JSON。",
  {
    sources: z
      .array(z.enum(["baidu", "zhihu", "bilibili", "weibo"]))
      .optional()
      .describe("Optional public hot-list sources. Defaults to baidu, zhihu and bilibili."),
    limit: z.number().int().min(1).max(50).optional().describe("Optional max trend count. Defaults to 20."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds. Defaults to 30."),
    verify_with_search: z.boolean().optional().describe("Whether to verify each trend with search results. Defaults to false.")
  },
  async ({ sources, limit, timeout, verify_with_search }) => {
    try {
      const input = normalizeChineseHotTrendsArgs({
        sources,
        limit,
        timeout,
        verify_with_search
      });
      const response = await runChineseHotTrends(input);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "hot_mining_pipeline",
  "执行中文热门信息挖掘流水线：热点发现、搜索验证、财经行业补充和长尾技术趋势补充。返回结构化 JSON。",
  {
    sources: z
      .array(z.enum(["baidu", "zhihu", "bilibili", "weibo"]))
      .optional()
      .describe("Optional discovery hot-list sources. Defaults to baidu, zhihu and bilibili."),
    limit: z.number().int().min(1).max(50).optional().describe("Optional max discovery trend count. Defaults to 20."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds. Defaults to 30."),
    include_industry: z.boolean().optional().describe("Whether to include finance_hotnews industry supplement. Defaults to true."),
    include_long_tail: z.boolean().optional().describe("Whether to include long-tail developer trend search. Defaults to true.")
  },
  async ({ sources, limit, timeout, include_industry, include_long_tail }) => {
    try {
      const input = normalizeHotMiningPipelineArgs({
        sources,
        limit,
        timeout,
        include_industry,
        include_long_tail
      });
      const response = await buildHotMiningPipeline(input);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
