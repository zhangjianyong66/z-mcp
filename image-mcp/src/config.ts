import { DEFAULT_DASHSCOPE_BASE_URL, DEFAULT_MODEL, type ImageProviderConfig } from "./types.js";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

type EnvSource = Record<string, string | undefined>;

function readEnv(source: EnvSource, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = source[name]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.replace(/\/+$/, "");
}

type ChainParseOptions = {
  chainVar: string;
  apiKeyVars: string[];
  baseURLVars: string[];
  modelVars: string[];
  defaultModel?: string;
};

function resolveChainPayload(source: EnvSource, chainVar: string): string | undefined {
  const rawValue = readEnv(source, chainVar);
  if (!rawValue) {
    return undefined;
  }

  if (!rawValue.startsWith("file:")) {
    return rawValue;
  }

  const rawPath = rawValue.slice("file:".length).trim();
  if (!rawPath) {
    throw new Error(`${chainVar} file path is empty`);
  }

  const path = isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${chainVar} file read failed: ${message}`);
  }
}

function parseChainEntry(entry: unknown, index: number): ImageProviderConfig {
  if (!entry || typeof entry !== "object") {
    throw new Error(`IMAGE_MODEL_CHAIN item at index ${index} must be an object`);
  }

  const candidate = entry as Record<string, unknown>;
  const provider = candidate.provider;
  const model = typeof candidate.model === "string" ? candidate.model.trim() : "";
  const apiKey = typeof candidate.apiKey === "string" ? candidate.apiKey.trim() : "";
  const baseURLRaw = typeof candidate.baseURL === "string" ? candidate.baseURL.trim() : DEFAULT_DASHSCOPE_BASE_URL;

  if (provider !== "dashscope") {
    throw new Error(`IMAGE_MODEL_CHAIN item at index ${index} has unsupported provider: ${String(provider)}`);
  }

  if (!model) {
    throw new Error(`IMAGE_MODEL_CHAIN item at index ${index} is missing model`);
  }

  if (!apiKey) {
    throw new Error(`IMAGE_MODEL_CHAIN item at index ${index} is missing apiKey`);
  }

  return {
    provider,
    model,
    apiKey,
    baseURL: normalizeBaseURL(baseURLRaw)
  };
}

function resolveLegacyConfig(source: EnvSource): ImageProviderConfig {
  return resolveLegacyConfigByOptions(source, {
    chainVar: "IMAGE_MODEL_CHAIN",
    apiKeyVars: ["DASHSCOPE_API_KEY", "LLM_API_KEY"],
    baseURLVars: ["DASHSCOPE_BASE_URL", "LLM_BASE_URL"],
    modelVars: ["DASHSCOPE_MODEL", "LLM_MODEL"],
    defaultModel: DEFAULT_MODEL
  });
}

function resolveLegacyConfigByOptions(source: EnvSource, options: ChainParseOptions): ImageProviderConfig {
  const apiKey = readEnv(source, ...options.apiKeyVars);
  if (!apiKey) {
    throw new Error(`Missing required environment variable: ${options.apiKeyVars.join(" or ")}`);
  }

  const model = readEnv(source, ...options.modelVars) ?? options.defaultModel;
  if (!model) {
    throw new Error(`Missing required environment variable: ${options.modelVars.join(" or ")}`);
  }

  return {
    provider: "dashscope",
    apiKey,
    baseURL: normalizeBaseURL(readEnv(source, ...options.baseURLVars) ?? DEFAULT_DASHSCOPE_BASE_URL),
    model
  };
}

function resolveProviderChainByOptions(source: EnvSource, options: ChainParseOptions): ImageProviderConfig[] {
  const serializedChain = resolveChainPayload(source, options.chainVar);
  if (!serializedChain) {
    return [resolveLegacyConfigByOptions(source, options)];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedChain);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${options.chainVar} must be valid JSON: ${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${options.chainVar} must be a JSON array`);
  }

  if (parsed.length === 0) {
    throw new Error(`${options.chainVar} must contain at least one provider config`);
  }

  return parsed.map((entry, index) => parseChainEntry(entry, index));
}

export function resolveProviderChain(source: EnvSource = process.env): ImageProviderConfig[] {
  return resolveProviderChainByOptions(source, {
    chainVar: "IMAGE_MODEL_CHAIN",
    apiKeyVars: ["DASHSCOPE_API_KEY", "LLM_API_KEY"],
    baseURLVars: ["DASHSCOPE_BASE_URL", "LLM_BASE_URL"],
    modelVars: ["DASHSCOPE_MODEL", "LLM_MODEL"],
    defaultModel: DEFAULT_MODEL
  });
}

export function resolveVisionProviderChain(source: EnvSource = process.env): ImageProviderConfig[] {
  return resolveProviderChainByOptions(source, {
    chainVar: "VISION_MODEL_CHAIN",
    apiKeyVars: ["VISION_API_KEY", "DASHSCOPE_API_KEY", "LLM_API_KEY"],
    baseURLVars: ["VISION_BASE_URL", "DASHSCOPE_BASE_URL", "LLM_BASE_URL"],
    modelVars: ["VISION_MODEL"],
  });
}
