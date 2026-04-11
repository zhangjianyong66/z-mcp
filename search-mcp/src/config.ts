import type { SearchProvider } from "./types.js";

export const DEFAULT_ALIYUN_WEBSEARCH_BASE_URL = "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp";
export const DEFAULT_BAIDU_WEBSEARCH_BASE_URL = "https://qianfan.baidubce.com/v2/ai_search/web_search";

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

export function getAliyunWebSearchConfig(): { apiKey: string; baseURL: string } {
  const apiKey = readEnv("ALIYUN_WEBSEARCH_API_KEY", "DASHSCOPE_API_KEY", "LLM_API_KEY");
  if (!apiKey) {
    throw new Error(
      "Missing required environment variable for aliyun provider: ALIYUN_WEBSEARCH_API_KEY, DASHSCOPE_API_KEY, or LLM_API_KEY"
    );
  }

  return {
    apiKey,
    baseURL: normalizeBaseURL(readEnv("ALIYUN_WEBSEARCH_BASE_URL") ?? DEFAULT_ALIYUN_WEBSEARCH_BASE_URL)
  };
}

export function getBaiduWebSearchConfig(): { apiKey: string; baseURL: string } {
  const apiKey = readEnv("BAIDU_API_KEY");
  if (!apiKey) {
    throw new Error("Missing required environment variable for baidu provider: BAIDU_API_KEY");
  }

  return {
    apiKey,
    baseURL: normalizeBaseURL(readEnv("BAIDU_WEBSEARCH_BASE_URL") ?? DEFAULT_BAIDU_WEBSEARCH_BASE_URL)
  };
}

export function withTimeout(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

export function formatProviderError(provider: SearchProvider, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${provider} search failed: ${message}`);
}
