import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import OpenAI from "openai";
import { z } from "zod";

const DEFAULT_PROMPT =
  "请识别这张图片的主要内容，并输出简洁、结构化的结果，包括：summary、objects、scene、visible_text、confidence。";

const SYSTEM_PROMPT =
  "You are an image analysis assistant. Return valid JSON with keys: summary, objects, scene, visible_text, confidence.";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";

const ImageAnalysisSchema = z.object({
  summary: z.string().default(""),
  objects: z.array(z.string()).default([]),
  scene: z.string().default(""),
  visible_text: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0)
});

type ImageAnalysis = z.infer<typeof ImageAnalysisSchema>;
type ApiStyle = "openai-compatible" | "anthropic-compatible";

type ResolvedImage = {
  dataUrl: string;
  mimeType: string;
};

type ProviderConfig = {
  apiStyle: ApiStyle;
  apiKey: string;
  baseURL: string;
  model: string;
  anthropicVersion?: string;
};

type ProviderResult = {
  model: string;
  providerStyle: ApiStyle;
  rawText: string;
};

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

function parseDataUrl(dataUrl: string): ResolvedImage {
  const match = /^data:([^;,]+);base64,/.exec(dataUrl);
  return {
    dataUrl,
    mimeType: match?.[1] ?? "application/octet-stream"
  };
}

function guessMimeTypeFromUrl(imageUrl: string): string {
  try {
    const url = new URL(imageUrl);
    return getMimeType(url.pathname);
  } catch {
    return "application/octet-stream";
  }
}

async function fetchRemoteImage(imageUrl: string): Promise<ResolvedImage> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch remote image: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const mimeType = response.headers.get("content-type")?.split(";")[0] ?? guessMimeTypeFromUrl(imageUrl);
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return {
    dataUrl: `data:${mimeType};base64,${base64}`,
    mimeType
  };
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
  return {
    dataUrl: `data:${mimeType};base64,${fileBuffer.toString("base64")}`,
    mimeType
  };
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

function resolveProviderConfig(modelOverride?: string): ProviderConfig {
  const apiStyle = (readEnv("LLM_API_STYLE") ?? "openai-compatible") as ApiStyle;

  if (apiStyle === "anthropic-compatible") {
    const apiKey = readEnv("LLM_API_KEY", "ANTHROPIC_API_KEY");
    const baseURL = readEnv("LLM_BASE_URL", "ANTHROPIC_BASE_URL");
    const model = modelOverride ?? readEnv("LLM_MODEL", "ANTHROPIC_MODEL");

    if (!apiKey) {
      throw new Error("Missing required environment variable: LLM_API_KEY or ANTHROPIC_API_KEY");
    }
    if (!baseURL) {
      throw new Error("Missing required environment variable: LLM_BASE_URL or ANTHROPIC_BASE_URL");
    }
    if (!model) {
      throw new Error("Missing required environment variable: LLM_MODEL or ANTHROPIC_MODEL");
    }

    return {
      apiStyle,
      apiKey,
      baseURL: normalizeBaseURL(baseURL),
      model,
      anthropicVersion: readEnv("ANTHROPIC_VERSION") ?? DEFAULT_ANTHROPIC_VERSION
    };
  }

  const apiKey = readEnv("LLM_API_KEY", "OPENAI_API_KEY");
  const baseURL = readEnv("LLM_BASE_URL", "OPENAI_BASE_URL") ?? DEFAULT_OPENAI_BASE_URL;
  const model = modelOverride ?? readEnv("LLM_MODEL", "OPENAI_MODEL") ?? "gpt-4.1-mini";

  if (!apiKey) {
    throw new Error("Missing required environment variable: LLM_API_KEY or OPENAI_API_KEY");
  }

  return {
    apiStyle,
    apiKey,
    baseURL: normalizeBaseURL(baseURL),
    model
  };
}

function isMiniMaxAnthropicConfig(config: ProviderConfig): boolean {
  return (
    config.apiStyle === "anthropic-compatible" &&
    (config.baseURL.toLowerCase().includes("minimax") || config.model.toLowerCase().includes("minimax"))
  );
}

async function callOpenAICompatible(
  config: ProviderConfig,
  image: ResolvedImage,
  prompt: string,
  detail: "auto" | "low" | "high"
): Promise<ProviderResult> {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });

  const completion = await client.chat.completions.create({
    model: config.model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt
          },
          {
            type: "image_url",
            image_url: {
              url: image.dataUrl,
              detail
            }
          }
        ]
      }
    ]
  });

  const rawText =
    typeof completion.choices[0]?.message?.content === "string" ? completion.choices[0].message.content : "";

  return {
    model: completion.model,
    providerStyle: "openai-compatible",
    rawText
  };
}

async function callAnthropicCompatible(
  config: ProviderConfig,
  image: ResolvedImage,
  prompt: string
): Promise<ProviderResult> {
  if (isMiniMaxAnthropicConfig(config)) {
    throw new Error(
      "Current MiniMax anthropic-compatible API does not support image input blocks. Use an openai-compatible vision model or add a MiniMax native vision adapter."
    );
  }

  const [, base64 = ""] = image.dataUrl.split(",", 2);
  const response = await fetch(`${config.baseURL}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": config.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image.mimeType,
                data: base64
              }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic-compatible request failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as {
    model?: string;
    content?: Array<{ type?: string; text?: string }>;
  };

  const rawText = payload.content
    ?.filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();

  return {
    model: payload.model ?? config.model,
    providerStyle: "anthropic-compatible",
    rawText: rawText ?? ""
  };
}

async function analyzeImage(input: {
  image: string;
  prompt?: string;
  model?: string;
  detail?: "auto" | "low" | "high";
}): Promise<{ model: string; provider: ApiStyle; analysis: ImageAnalysis }> {
  const config = resolveProviderConfig(input.model);
  const resolvedImage = await resolveImageInput(input.image);
  const prompt = input.prompt ?? DEFAULT_PROMPT;
  const result =
    config.apiStyle === "anthropic-compatible"
      ? await callAnthropicCompatible(config, resolvedImage, prompt)
      : await callOpenAICompatible(config, resolvedImage, prompt, input.detail ?? "auto");

  return {
    model: result.model,
    provider: result.providerStyle,
    analysis: parseAnalysis(result.rawText)
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
      .describe("Vision detail level for openai-compatible providers.")
  },
  async ({ image, prompt, model, detail }) => {
    try {
      const result = await analyzeImage({ image, prompt, model, detail });
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
