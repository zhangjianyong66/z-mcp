import "dotenv/config";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  runEtfAnalyze,
  runEtfBatchAnalyze,
  runEtfBatchKline,
  runEtfBatchQuote,
  runEtfKline,
  runEtfQuote,
  runSectorList
} from "./stock-data.js";
import {
  configureStockDataLogging,
  logStockDataEvent
} from "./logging.js";
import { warmXueqiuCookie } from "./providers/xueqiu.js";
import { getPortfolioAndOrders, saveOrders, savePortfolio } from "./portfolio-store.js";

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
    const errorDetails =
      error && typeof error === "object" && "details" in error
        ? (error as { details?: unknown }).details
        : undefined;
    logStockDataEvent("tool.error", {
      requestId,
      tool,
      durationMs: Date.now() - startedAt,
      error: message,
      ...(errorDetails ? { errorDetails } : {})
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
  for (const key of ["source", "symbol", "normalizedSymbol", "sortBy", "fetchAll", "total"]) {
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
const isoDatetimeSchema = z.string().datetime({ offset: true });

const portfolioPositionSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().positive(),
  costPrice: z.number().min(0),
  currentPrice: z.number().min(0),
  marketValue: z.number().min(0)
});

const portfolioOrderSchema = z.object({
  orderId: z.string().min(1).optional(),
  symbol: z.string().min(1),
  name: z.string().min(1),
  side: z.enum(["buy", "sell"]),
  quantity: z.number().positive(),
  orderTime: isoDatetimeSchema,
  status: z.enum(["pending", "filled", "cancelled", "expired"])
});

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
            text: JSON.stringify(result)
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
            text: JSON.stringify(result)
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
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "etf_batch_quote",
  "批量获取多个 ETF 最新行情。支持 159930、510300 等代码格式，最多 20 个。",
  {
    symbols: z.array(z.string().min(1)).min(1).max(20).describe("List of ETF symbols such as [159930, 510300]."),
    source: providerSchema.optional().describe("Optional provider. Defaults to xueqiu."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds. Defaults to 15.")
  },
  async ({ symbols, source, timeout }) => {
    try {
      const result = await runTool("etf_batch_quote", { symbols, source, timeout }, (requestId) =>
        runEtfBatchQuote({ symbols, source, timeout }, undefined, undefined, { requestId })
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "etf_batch_kline",
  "批量获取多个 ETF 历史日 K 线数据。最多 20 个。",
  {
    symbols: z.array(z.string().min(1)).min(1).max(20).describe("List of ETF symbols such as [159930, 510300]."),
    source: providerSchema.optional().describe("Optional provider. Defaults to xueqiu."),
    days: z.number().int().min(5).max(180).optional().describe("Optional day count. Defaults to 30."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds. Defaults to 15.")
  },
  async ({ symbols, source, days, timeout }) => {
    try {
      const result = await runTool("etf_batch_kline", { symbols, source, days, timeout }, (requestId) =>
        runEtfBatchKline({ symbols, source, days, timeout }, undefined, undefined, { requestId })
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "etf_batch_analyze",
  "批量分析多个 ETF，包含 MA5、MA10、MA20、30 日高低点及简单趋势标签。最多 20 个。",
  {
    symbols: z.array(z.string().min(1)).min(1).max(20).describe("List of ETF symbols such as [159930, 510300]."),
    source: providerSchema.optional().describe("Optional provider. Defaults to xueqiu."),
    days: z.number().int().min(20).max(180).optional().describe("Optional day count. Defaults to 30."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds. Defaults to 15.")
  },
  async ({ symbols, source, days, timeout }) => {
    try {
      const result = await runTool("etf_batch_analyze", { symbols, source, days, timeout }, (requestId) =>
        runEtfBatchAnalyze({ symbols, source, days, timeout }, undefined, undefined, { requestId })
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "save_portfolio_info",
  "保存或更新我的持仓信息（全量覆盖）。",
  {
    totalCapital: z.number().min(0).describe("总资金"),
    availableCapital: z.number().min(0).describe("可用资金"),
    positions: z.array(portfolioPositionSchema).describe("持仓列表"),
    updatedAt: isoDatetimeSchema.optional().describe("可选更新时间（ISO-8601，带时区）")
  },
  async ({ totalCapital, availableCapital, positions, updatedAt }) => {
    try {
      const result = await runTool(
        "save_portfolio_info",
        { totalCapital, availableCapital, positionsCount: positions.length, updatedAt },
        async () =>
          savePortfolio({
            totalCapital,
            availableCapital,
            positions,
            updatedAt
          })
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "save_trade_orders",
  "保存或更新我的交易单信息（全量覆盖）。挂单若跨自然日会自动失效。",
  {
    orders: z.array(portfolioOrderSchema).describe("交易单列表")
  },
  async ({ orders }) => {
    try {
      const result = await runTool(
        "save_trade_orders",
        { ordersCount: orders.length },
        async () => saveOrders(orders)
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "get_portfolio_and_orders",
  "获取我的持仓和交易单信息。挂单若跨自然日会自动失效。",
  {},
  async () => {
    try {
      const result = await runTool(
        "get_portfolio_and_orders",
        {},
        async () => getPortfolioAndOrders()
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
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
  "获取同花顺行业板块汇总行情（全量返回），支持涨幅榜、跌幅榜和热门榜排序。",
  {
    sortBy: sectorListSortSchema.optional().describe("Optional sort mode. Defaults to hot."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds. Defaults to 20.")
  },
  async ({ sortBy, timeout }) => {
    try {
      const result = await runTool(
        "sector_list",
        { sortBy, timeout },
        (requestId) =>
          runSectorList({ sortBy, timeout }, undefined, undefined, { requestId })
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
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
