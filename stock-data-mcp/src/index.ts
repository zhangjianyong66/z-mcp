import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  runEtfAnalyze,
  runEtfKline,
  runEtfList,
  runEtfQuote
} from "./stock-data.js";

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
  name: "stock-data-mcp",
  version: "0.1.0"
});

const providerSchema = z.enum(["eastmoney", "xueqiu"]);

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
      const result = await runEtfQuote({ symbol, source, timeout });
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
      const result = await runEtfKline({ symbol, source, days, timeout });
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
      const result = await runEtfAnalyze({ symbol, source, days, timeout });
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
  "List ETFs sorted by change percentage from eastmoney.",
  {
    limit: z.number().int().min(1).max(100).optional().describe("Optional max ETF count. Defaults to 20."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds. Defaults to 15.")
  },
  async ({ limit, timeout }) => {
    try {
      const result = await runEtfList({ limit, timeout });
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
