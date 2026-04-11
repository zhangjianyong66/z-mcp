import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DEFAULT_DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com";
const DEFAULT_MODEL = "qwen-image-2.0-pro";

type GeneratedImage = {
  url: string;
};

type ImageInput = {
  image: string;
};

type GenerationResult = {
  model: string;
  provider: "dashscope";
  prompt: string;
  revisedPrompt?: string;
  requestId?: string;
  results: GeneratedImage[];
};

type DashScopeResponse = {
  request_id?: string;
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{
          image?: string;
          text?: string;
        }>;
      };
    }>;
  };
  usage?: {
    image_count?: number;
  };
};

type ResolvedImage = {
  image: string;
};

function readEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.replace(/\/+$/, "");
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
    case ".bmp":
      return "image/bmp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    default:
      return "application/octet-stream";
  }
}

function parseDataUrl(dataUrl: string): ResolvedImage {
  const match = /^data:(image\/[^;,]+);base64,/.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid data URL. Expected format: data:image/<type>;base64,<data>.");
  }

  return { image: dataUrl };
}

async function fetchRemoteImage(imageUrl: string): Promise<ResolvedImage> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch remote image: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  if (contentType?.startsWith("image/")) {
    return { image: imageUrl };
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = contentType && contentType !== "application/octet-stream" ? contentType : "image/png";
  return { image: `data:${mimeType};base64,${base64}` };
}

async function resolveImageInput(image: string): Promise<ResolvedImage> {
  if (image.startsWith("data:image/")) {
    return parseDataUrl(image);
  }

  if (image.startsWith("http://") || image.startsWith("https://")) {
    return fetchRemoteImage(image);
  }

  const fileBuffer = await readFile(image);
  const mimeType = getMimeType(image);
  if (!mimeType.startsWith("image/")) {
    throw new Error(`Unsupported local image type: ${image}`);
  }

  return {
    image: `data:${mimeType};base64,${fileBuffer.toString("base64")}`
  };
}

function resolveConfig(): { apiKey: string; baseURL: string; model: string } {
  const apiKey = readEnv("DASHSCOPE_API_KEY", "LLM_API_KEY");
  if (!apiKey) {
    throw new Error("Missing required environment variable: DASHSCOPE_API_KEY or LLM_API_KEY");
  }

  return {
    apiKey,
    baseURL: normalizeBaseURL(readEnv("DASHSCOPE_BASE_URL", "LLM_BASE_URL") ?? DEFAULT_DASHSCOPE_BASE_URL),
    model: readEnv("DASHSCOPE_MODEL", "LLM_MODEL") ?? DEFAULT_MODEL
  };
}

function parseGeneratedImages(payload: DashScopeResponse): GeneratedImage[] {
  const images =
    payload.output?.choices
      ?.flatMap((choice) => choice.message?.content ?? [])
      .map((item) => item.image?.trim())
      .filter((item): item is string => Boolean(item)) ?? [];

  return images.map((url) => ({ url }));
}

async function generateImage(input: {
  prompt: string;
  size?: string;
  n?: number;
  negative_prompt?: string;
  watermark?: boolean;
}): Promise<GenerationResult> {
  const config = resolveConfig();
  const response = await fetch(`${config.baseURL}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      input: {
        messages: [
          {
            role: "user",
            content: [
              {
                text: input.prompt
              }
            ]
          }
        ]
      },
      parameters: {
        ...(input.size ? { size: input.size } : {}),
        ...(typeof input.n === "number" ? { n: input.n } : {}),
        ...(input.negative_prompt ? { negative_prompt: input.negative_prompt } : {}),
        ...(typeof input.watermark === "boolean" ? { watermark: input.watermark } : {})
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DashScope image generation request failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as DashScopeResponse;
  const results = parseGeneratedImages(payload);
  if (results.length === 0) {
    throw new Error("DashScope image generation succeeded but returned no image URLs.");
  }

  const revisedPrompt = payload.output?.choices
    ?.flatMap((choice) => choice.message?.content ?? [])
    .map((item) => item.text?.trim())
    .find((text): text is string => Boolean(text));

  return {
    model: config.model,
    provider: "dashscope",
    prompt: input.prompt,
    ...(revisedPrompt ? { revisedPrompt } : {}),
    ...(payload.request_id ? { requestId: payload.request_id } : {}),
    results
  };
}

async function editImage(input: {
  prompt: string;
  images: string[];
  size?: string;
  n?: number;
  negative_prompt?: string;
  watermark?: boolean;
}): Promise<GenerationResult> {
  const config = resolveConfig();
  const resolvedImages = await Promise.all(input.images.map((image) => resolveImageInput(image)));
  const response = await fetch(`${config.baseURL}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      input: {
        messages: [
          {
            role: "user",
            content: [
              ...resolvedImages.map((image) => ({ image: image.image })),
              {
                text: input.prompt
              }
            ]
          }
        ]
      },
      parameters: {
        ...(input.size ? { size: input.size } : {}),
        ...(typeof input.n === "number" ? { n: input.n } : {}),
        ...(input.negative_prompt ? { negative_prompt: input.negative_prompt } : {}),
        ...(typeof input.watermark === "boolean" ? { watermark: input.watermark } : {})
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DashScope image edit request failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as DashScopeResponse;
  const results = parseGeneratedImages(payload);
  if (results.length === 0) {
    throw new Error("DashScope image edit succeeded but returned no image URLs.");
  }

  const revisedPrompt = payload.output?.choices
    ?.flatMap((choice) => choice.message?.content ?? [])
    .map((item) => item.text?.trim())
    .find((text): text is string => Boolean(text));

  return {
    model: config.model,
    provider: "dashscope",
    prompt: input.prompt,
    ...(revisedPrompt ? { revisedPrompt } : {}),
    ...(payload.request_id ? { requestId: payload.request_id } : {}),
    results
  };
}

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
  version: "0.2.0"
});

server.tool(
  "generate_image",
  "Generate images with DashScope qwen-image and return temporary image URLs.",
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
  "edit_image",
  "Generate images from 1-3 reference images with DashScope qwen-image-edit style inputs.",
  {
    prompt: z.string().min(1).describe("Instruction describing the desired output based on the reference images."),
    images: z
      .array(z.string().min(1))
      .min(1)
      .max(3)
      .describe("1-3 reference images. Supports remote URLs, local file paths, and data URLs."),
    size: z.string().min(1).optional().describe("Optional output size, such as 1024*1024."),
    n: z.number().int().min(1).max(6).optional().describe("Optional number of images to generate."),
    negative_prompt: z.string().min(1).optional().describe("Optional negative prompt."),
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
