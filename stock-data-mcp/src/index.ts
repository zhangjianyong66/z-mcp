import "dotenv/config";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  runEtfAnalyze,
  runEtfKline,
  runEtfQuote,
  runSectorList
} from "./stock-data.js";
import {
  configureStockDataLogging,
  logStockDataEvent
} from "./logging.js";
import { warmXueqiuCookie } from "./providers/xueqiu.js";

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

async function runTool<T>(
  tool: string,
  input: Record<string, unknown>,
  handler: (requestId: string) => Promise<T>
): Promise<T> {
  const requestId = randomUUID();
  const startedAt = Date.now();
  logStockDataEvent("tool.start", { requestId, tool, input }, "info");
  try {
    const result = await handler(requestId);
    logStockDataEvent("tool.success", {
      requestId,
      tool,
      durationMs: Date.now() - startedAt,
      resultSummary: summarizeResult(result)
    }, "notice");
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStockDataEvent("tool.error", {
      requestId,
      tool,
      durationMs: Date.now() - startedAt,
      error: message
    }, "error");
    throw error;
  }
}

function summarizeResult(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== "object") {
    return { kind: typeof result };
  }

  const data = result as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const key of ["source", "symbol", "normalizedSymbol", "sortBy", "fetchAll", "page", "pageSize", "total", "count", "hasMore"]) {
    if (key in data) {
      summary[key] = data[key];
    }
  }
  if ("data" in data && Array.isArray(data.data)) {
    summary.dataLength = data.data.length;
  }
  if ("items" in data && Array.isArray(data.items)) {
    summary.itemsLength = data.items.length;
  }
  return summary;
}

const server = new McpServer({
  name: "stock-data-mcp",
  version: "0.1.0"
}, {
  capabilities: {
    logging: {}
  }
});

configureStockDataLogging(server);

const providerSchema = z.enum(["xueqiu"]);
const sectorListSortSchema = z.enum(["gainers", "losers", "hot"]);

server.tool(
  "etf_quote",
  "获取最新 ETF 行情。支持 159930、510300、SZ159930、SH510300 等代码格式。",
  {
    symbol: z.string().min(1).describe("ETF symbol such as 159930 or SZ159930."),
    source: providerSchema.optional().describe("Optional provider. Defaults to xueqiu."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds. Defaults to 15.")
  },
  async ({ symbol, source, timeout }) => {
    try {
      const result = await runTool("etf_quote", { symbol, source, timeout }, (requestId) =>
        runEtfQuote({ symbol, source, timeout }, undefined, undefined, { requestId })
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "etf_kline",
  "获取 ETF 历史日 K 线数据。",
  {
    symbol: z.string().min(1).describe("ETF symbol such as 159930 or SH510300."),
    source: providerSchema.optional().describe("Optional provider. Defaults to xueqiu."),
    days: z.number().int().min(5).max(180).optional().describe("Optional day count. Defaults to 30."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds. Defaults to 15.")
  },
  async ({ symbol, source, days, timeout }) => {
    try {
      const result = await runTool("etf_kline", { symbol, source, days, timeout }, (requestId) =>
        runEtfKline({ symbol, source, days, timeout }, undefined, undefined, { requestId })
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "etf_analyze",
  "分析 ETF，包含 MA5、MA10、MA20、30 日高低点及简单趋势标签。",
  {
    symbol: z.string().min(1).describe("ETF symbol such as 159930 or SZ159930."),
    source: providerSchema.optional().describe("Optional provider. Defaults to xueqiu."),
    days: z.number().int().min(20).max(180).optional().describe("Optional day count. Defaults to 30."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds. Defaults to 15.")
  },
  async ({ symbol, source, days, timeout }) => {
    try {
      const result = await runTool("etf_analyze", { symbol, source, days, timeout }, (requestId) =>
        runEtfAnalyze({ symbol, source, days, timeout }, undefined, undefined, { requestId })
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "sector_list",
  "获取同花顺行业板块汇总行情，支持涨幅榜、跌幅榜和热门榜排序。",
  {
    limit: z.number().int().min(1).max(100).optional().describe("Legacy alias for pageSize. Defaults to 20."),
    page: z.number().int().min(1).optional().describe("Optional page number. Defaults to 1."),
    pageSize: z.number().int().min(1).max(100).optional().describe("Optional page size. Defaults to 20."),
    sortBy: sectorListSortSchema.optional().describe("Optional sort mode. Defaults to hot."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds. Defaults to 20.")
  },
  async ({ limit, page, pageSize, sortBy, timeout }) => {
    try {
      const result = await runTool(
        "sector_list",
        { limit, page, pageSize, sortBy, timeout },
        (requestId) =>
          runSectorList({ limit, page, pageSize, sortBy, timeout }, undefined, undefined, { requestId })
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

async function main(): Promise<void> {
  await warmXueqiuCookie();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
