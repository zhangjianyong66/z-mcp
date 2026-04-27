import type {
  EtfInput,
  EtfKlineInput,
  EtfProvider,
  SectorListInput,
  NormalizedEtfInput,
  NormalizedEtfKlineInput,
  NormalizedSectorListInput,
  NormalizedSymbol
} from "./types.js";
import {
  clamp,
  DEFAULT_KLINE_DAYS,
  DEFAULT_LIST_LIMIT,
  DEFAULT_TIMEOUT_SECONDS,
  MAX_KLINE_DAYS,
  MAX_LIST_LIMIT,
  MAX_TIMEOUT_SECONDS,
  MIN_KLINE_DAYS,
  MIN_LIST_LIMIT,
  MIN_TIMEOUT_SECONDS
} from "./config.js";

function inferMarketFromCode(code: string): "SH" | "SZ" {
  if (code.startsWith("5") || code.startsWith("6")) {
    return "SH";
  }
  return "SZ";
}

export function normalizeSymbol(raw: string): NormalizedSymbol {
  const value = raw.trim().toUpperCase();
  const match = /^(?:(SH|SZ))?(\d{6})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid ETF symbol: ${raw}`);
  }

  const code = match[2]!;
  const market = (match[1] as "SH" | "SZ" | undefined) ?? inferMarketFromCode(code);
  const secid = `${market === "SH" ? "1" : "0"}.${code}`;
  return {
    code,
    market,
    prefixed: `${market}${code}`,
    secid
  };
}

function normalizeTimeoutSeconds(timeout?: number): number {
  return clamp(timeout ?? DEFAULT_TIMEOUT_SECONDS, MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS);
}

export function normalizeEtfInput(
  input: EtfInput,
  defaultProvider: EtfProvider
): NormalizedEtfInput {
  return {
    symbol: input.symbol.trim(),
    provider: input.source ?? defaultProvider,
    timeoutMs: normalizeTimeoutSeconds(input.timeout) * 1000,
    normalizedSymbol: normalizeSymbol(input.symbol)
  };
}

export function normalizeEtfKlineInput(
  input: EtfKlineInput,
  defaultProvider: EtfProvider
): NormalizedEtfKlineInput {
  return {
    ...normalizeEtfInput(input, defaultProvider),
    days: clamp(input.days ?? DEFAULT_KLINE_DAYS, MIN_KLINE_DAYS, MAX_KLINE_DAYS)
  };
}

export function normalizeSectorListInput(input: SectorListInput = {}): NormalizedSectorListInput {
  const pageSize = input.pageSize ?? input.limit ?? DEFAULT_LIST_LIMIT;
  return {
    page: clamp(input.page ?? 1, 1, Number.MAX_SAFE_INTEGER),
    limit: clamp(pageSize, MIN_LIST_LIMIT, MAX_LIST_LIMIT),
    pageSize: clamp(pageSize, MIN_LIST_LIMIT, MAX_LIST_LIMIT),
    sortBy: input.sortBy ?? "hot",
    timeoutMs: normalizeTimeoutSeconds(input.timeout ?? 20) * 1000
  };
}
