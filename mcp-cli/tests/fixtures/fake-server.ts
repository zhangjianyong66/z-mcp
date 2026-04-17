import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "fixture-server",
  version: "1.2.3"
});

server.tool(
  "echo",
  "Echo input",
  {
    text: z.string().min(1)
  },
  async ({ text }) => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ echoed: text })
        }
      ]
    };
  }
);

await server.connect(new StdioServerTransport());
