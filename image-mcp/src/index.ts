import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { analyzeImage, editImage, generateImage } from "./service.js";

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
  name: "image-mcp",
  version: "0.3.0"
});

server.tool(
  "generate_image",
  "使用 DashScope qwen-image 生成图片，并返回临时图片 URL。",
  {
    prompt: z.string().min(1).describe("Prompt used to generate the image."),
    size: z.string().min(1).optional().describe("Optional output size, such as 1024*1024."),
    n: z.number().int().min(1).max(6).optional().describe("Optional number of images to generate."),
    negative_prompt: z.string().min(1).optional().describe("Optional negative prompt."),
    watermark: z.boolean().optional().describe("Optional watermark flag.")
  },
  async ({ prompt, size, n, negative_prompt, watermark }) => {
    try {
      const result = await generateImage({ prompt, size, n, negative_prompt, watermark });
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
  "analyze_image",
  "使用自然语言问题分析 1-3 张图片，并返回文本答案。",
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

server.tool(
  "edit_image",
  "基于 1-3 张参考图生成图片。这是参考融合工具，不是严格的风格/主体分离工具。风格迁移时，建议使用一张风格参考图并配合详细的新主体文字描述。使用多张参考图时，请明确描述每张图的角色，但不要假设它们之间有严格的隔离。",
  {
    prompt: z
      .string()
      .min(1)
      .describe(
        "Detailed instruction for how to use the reference images. Explicitly state which image controls style, which image controls subject identity or elements, what traits to preserve, and what should not be inherited. Avoid vague prompts like 'use image 1 style and image 2 subject'."
      ),
    images: z
      .array(z.string().min(1))
      .min(1)
      .max(3)
      .describe(
        "1-3 reference images in order. Supports remote URLs, local file paths, and data URLs. Single-image usage is usually more stable for style transfer. Multi-image usage is better for loose fusion of references, not strict control separation."
      ),
    size: z.string().min(1).optional().describe("Optional output size, such as 1024*1024."),
    n: z.number().int().min(1).max(6).optional().describe("Optional number of images to generate."),
    negative_prompt: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Optional exclusions, such as unwanted background, camera style, lighting, sticker look, 3D feel, texture noise, or details that should not be inherited from the reference images."
      ),
    watermark: z.boolean().optional().describe("Optional watermark flag.")
  },
  async ({ prompt, images, size, n, negative_prompt, watermark }) => {
    try {
      const result = await editImage({ prompt, images, size, n, negative_prompt, watermark });
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
