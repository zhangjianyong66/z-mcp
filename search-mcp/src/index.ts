import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
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
  "Search the web with a selected provider. Supported providers are aliyun, baidu, and ddg. When provider is omitted, aliyun is used by default.",
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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
