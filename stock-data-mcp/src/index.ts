import "dotenv/config";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  runEtfAnalyze,
  runEtfKline,
  runEtfList,
  runEtfQuote
} from "./stock-data.js";
import {
  configureStockDataLogging,
  logStockDataEvent
} from "./logging.js";

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

const providerSchema = z.enum(["eastmoney", "xueqiu"]);
const listSourceSchema = z.enum(["auto", "eastmoney", "sse"]);
const etfListSortSchema = z.enum(["gainers", "losers", "volume", "amount", "turnoverRate"]);

server.tool(
  "etf_quote",
  "Fetch the latest ETF quote. Supports symbols like 159930, 510300, SZ159930, and SH510300.",
  {
    symbol: z.string().min(1).describe("ETF symbol such as 159930 or SZ159930."),
    source: providerSchema.optional().describe("Optional provider. Defaults to eastmoney."),
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
  "Fetch historical ETF daily kline data.",
  {
    symbol: z.string().min(1).describe("ETF symbol such as 159930 or SH510300."),
    source: providerSchema.optional().describe("Optional provider. Defaults to eastmoney."),
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
  "Analyze an ETF with MA5, MA10, MA20, 30-day high/low, and a simple trend label.",
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
  "etf_list",
  "List ETFs by parsing the Eastmoney fund ETF grid page, with selectable sorting, paging, optional full fetch, and auto fallback from eastmoney to SSE.",
  {
    limit: z.number().int().min(1).max(100).optional().describe("Legacy alias for pageSize. Defaults to 20."),
    page: z.number().int().min(1).optional().describe("Optional page number. Defaults to 1."),
    pageSize: z.number().int().min(1).max(100).optional().describe("Optional page size. Defaults to 20."),
    sortBy: etfListSortSchema.optional().describe("Optional sort mode. Defaults to gainers."),
    fetchAll: z.boolean().optional().describe("If true, fetch every page before returning."),
    source: listSourceSchema.optional().describe("Optional data source. Defaults to auto."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds. Defaults to 15.")
  },
  async ({ limit, page, pageSize, sortBy, fetchAll, source, timeout }) => {
    try {
      const result = await runTool(
        "etf_list",
        { limit, page, pageSize, sortBy, fetchAll, source, timeout },
        (requestId) =>
          runEtfList({ limit, page, pageSize, sortBy, fetchAll, source, timeout }, undefined, undefined, { requestId })
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
