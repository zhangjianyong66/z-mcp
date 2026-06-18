import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { DEFAULT_DASHSCOPE_BASE_URL, type ImageProviderConfig } from "./types.js";

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
    throw new Error(`VISION_MODEL_CHAIN item at index ${index} must be an object`);
  }

  const candidate = entry as Record<string, unknown>;
  const provider = candidate.provider;
  const model = typeof candidate.model === "string" ? candidate.model.trim() : "";
  const apiKey = typeof candidate.apiKey === "string" ? candidate.apiKey.trim() : "";
  const baseURLRaw = typeof candidate.baseURL === "string" ? candidate.baseURL.trim() : DEFAULT_DASHSCOPE_BASE_URL;

  if (provider !== "dashscope") {
    throw new Error(`VISION_MODEL_CHAIN item at index ${index} has unsupported provider: ${String(provider)}`);
  }

  if (!model) {
    throw new Error(`VISION_MODEL_CHAIN item at index ${index} is missing model`);
  }

  if (!apiKey) {
    throw new Error(`VISION_MODEL_CHAIN item at index ${index} is missing apiKey`);
  }

  return {
    provider,
    model,
    apiKey,
    baseURL: normalizeBaseURL(baseURLRaw)
  };
}

function resolveSingleVisionConfig(source: EnvSource): ImageProviderConfig {
  const apiKey = readEnv(source, "DASHSCOPE_API_KEY", "LLM_API_KEY");
  if (!apiKey) {
    throw new Error("Missing required environment variable: DASHSCOPE_API_KEY or LLM_API_KEY");
  }

  const model = readEnv(source, "VISION_MODEL");
  if (!model) {
    throw new Error("Missing required environment variable: VISION_MODEL");
  }

  return {
    provider: "dashscope",
    model,
    apiKey,
    baseURL: normalizeBaseURL(readEnv(source, "DASHSCOPE_BASE_URL", "LLM_BASE_URL") ?? DEFAULT_DASHSCOPE_BASE_URL)
  };
}

export function resolveVisionProviderChain(source: EnvSource = process.env): ImageProviderConfig[] {
  const serializedChain = resolveChainPayload(source, "VISION_MODEL_CHAIN");
  if (!serializedChain) {
    return [resolveSingleVisionConfig(source)];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedChain);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`VISION_MODEL_CHAIN must be valid JSON: ${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("VISION_MODEL_CHAIN must be a JSON array");
  }

  if (parsed.length === 0) {
    throw new Error("VISION_MODEL_CHAIN must contain at least one provider config");
  }

  return parsed.map((entry, index) => parseChainEntry(entry, index));
}
