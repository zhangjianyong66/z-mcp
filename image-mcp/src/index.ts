import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import OpenAI from "openai";
import { z } from "zod";

const DEFAULT_PROMPT =
  "请识别这张图片的主要内容，并输出简洁、结构化的结果，包括：summary、objects、scene、visible_text、confidence。";

const ImageAnalysisSchema = z.object({
  summary: z.string().default(""),
  objects: z.array(z.string()).default([]),
  scene: z.string().default(""),
  visible_text: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0)
});

type ImageAnalysis = z.infer<typeof ImageAnalysisSchema>;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

async function resolveImageInput(image: string): Promise<string> {
  if (image.startsWith("http://") || image.startsWith("https://")) {
    return image;
  }

  if (image.startsWith("data:image/")) {
    return image;
  }

  const fileBuffer = await readFile(image);
  const mimeType = getMimeType(image);
  return `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
}

function parseAnalysis(rawText: string): ImageAnalysis {
  try {
    const parsed = JSON.parse(rawText);
    return ImageAnalysisSchema.parse(parsed);
  } catch {
    return {
      summary: rawText.trim(),
      objects: [],
      scene: "",
      visible_text: "",
      confidence: 0.3
    };
  }
}

const server = new McpServer({
  name: "image-mcp",
  version: "0.1.0"
});

server.tool(
  "describe_image",
  "Analyze an image and return a structured description. Supports remote URLs, local file paths, and data URLs.",
  {
    image: z.string().min(1).describe("Image URL, local file path, or data URL."),
    prompt: z
      .string()
      .min(1)
      .optional()
      .describe("Optional task instruction for the model."),
    model: z
      .string()
      .min(1)
      .optional()
      .describe("Optional model override."),
    detail: z
      .enum(["auto", "low", "high"])
      .optional()
      .describe("Vision detail level when supported by the provider.")
  },
  async ({ image, prompt, model, detail }) => {
    const client = new OpenAI({
      apiKey: requiredEnv("OPENAI_API_KEY"),
      baseURL: process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1"
    });

    const imageUrl = await resolveImageInput(image);
    const completion = await client.chat.completions.create({
      model: model ?? process.env.OPENAI_MODEL?.trim() ?? "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an image analysis assistant. Return valid JSON with keys: summary, objects, scene, visible_text, confidence."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt ?? DEFAULT_PROMPT
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: detail ?? "auto"
              }
            }
          ]
        }
      ]
    });

    const rawText =
      typeof completion.choices[0]?.message?.content === "string"
        ? completion.choices[0].message.content
        : "";
    const analysis = parseAnalysis(rawText);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              model: completion.model,
              analysis
            },
            null,
            2
          )
        }
      ]
    };
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
