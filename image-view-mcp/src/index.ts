import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { argv, exit, stderr } from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { analyzeImage } from "./service.js";

export const IMAGE_VIEW_TOOL_NAMES = ["analyze_image"] as const;

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

export function createServer(): McpServer {
  const server = new McpServer({
    name: "image-view-mcp",
    version: "0.1.0"
  });

  server.tool(
    "analyze_image",
    "使用多模态视觉模型分析 1-3 张图片，并返回文本答案。",
    {
      prompt: z.string().min(1).describe("Question or instruction for analyzing the provided images."),
      images: z
        .array(z.string().min(1))
        .min(1)
        .max(3)
        .describe("1-3 images in order. Supports remote URLs, local file paths, and data URLs.")
    },
    async ({ prompt, images }) => {
      try {
        const result = await analyzeImage({ prompt, images });
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

  return server;
}

export async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await createServer().connect(transport);
}

if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    stderr.write(`${message}\n`);
    exit(1);
  });
}
