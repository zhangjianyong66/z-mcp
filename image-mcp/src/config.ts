import { DEFAULT_DASHSCOPE_BASE_URL, DEFAULT_MODEL, type ImageProviderConfig } from "./types.js";

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
  const apiKey = readEnv(source, "DASHSCOPE_API_KEY", "LLM_API_KEY");
  if (!apiKey) {
    throw new Error("Missing required environment variable: DASHSCOPE_API_KEY or LLM_API_KEY");
  }

  return {
    provider: "dashscope",
    apiKey,
    baseURL: normalizeBaseURL(readEnv(source, "DASHSCOPE_BASE_URL", "LLM_BASE_URL") ?? DEFAULT_DASHSCOPE_BASE_URL),
    model: readEnv(source, "DASHSCOPE_MODEL", "LLM_MODEL") ?? DEFAULT_MODEL
  };
}

export function resolveProviderChain(source: EnvSource = process.env): ImageProviderConfig[] {
  const serializedChain = readEnv(source, "IMAGE_MODEL_CHAIN");
  if (!serializedChain) {
    return [resolveLegacyConfig(source)];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedChain);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`IMAGE_MODEL_CHAIN must be valid JSON: ${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("IMAGE_MODEL_CHAIN must be a JSON array");
  }

  if (parsed.length === 0) {
    throw new Error("IMAGE_MODEL_CHAIN must contain at least one provider config");
  }

  return parsed.map((entry, index) => parseChainEntry(entry, index));
}
