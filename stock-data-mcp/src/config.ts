import type { EtfProvider } from "./types.js";

export const DEFAULT_TIMEOUT_SECONDS = 15;
export const DEFAULT_LIST_LIMIT = 20;
export const DEFAULT_KLINE_DAYS = 30;
export const MAX_TIMEOUT_SECONDS = 120;
export const MIN_TIMEOUT_SECONDS = 1;
export const MIN_LIST_LIMIT = 1;
export const MAX_LIST_LIMIT = 100;
export const MIN_KLINE_DAYS = 5;
export const MAX_KLINE_DAYS = 180;

function readEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

export function withTimeout(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatProviderError(provider: EtfProvider, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${provider} request failed: ${message}`);
}

export function getXueqiuConfig(): { cookie?: string; userAgent: string } {
  return {
    cookie: readEnv("XUEQIU_COOKIE"),
    userAgent:
      readEnv("XUEQIU_USER_AGENT") ??
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  };
}
