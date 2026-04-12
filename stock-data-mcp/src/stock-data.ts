import { formatProviderError } from "./config.js";
import { createEastmoneyProvider } from "./providers/eastmoney.js";
import { createXueqiuProvider } from "./providers/xueqiu.js";
import {
  normalizeEtfInput,
  normalizeEtfKlineInput,
  normalizeEtfListInput
} from "./symbol.js";
import type {
  EtfAnalyzeResponse,
  EtfInput,
  EtfKlineInput,
  EtfKlinePoint,
  EtfKlineResponse,
  EtfListInput,
  EtfListResponse,
  EtfProviderMap,
  EtfQuoteResponse
} from "./types.js";

export function createProviderMap(): EtfProviderMap {
  return {
    eastmoney: createEastmoneyProvider(),
    xueqiu: createXueqiuProvider()
  };
}

function calculateAverage(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return Number((sum / values.length).toFixed(3));
}

function getTrend(current: number, ma5: number | null, ma10: number | null): string {
  if (ma5 === null || ma10 === null) {
    return "insufficient_data";
  }
  if (current > ma5 && ma5 > ma10) {
    return "bullish";
  }
  if (current < ma5 && ma5 < ma10) {
    return "bearish";
  }
  return "rangebound";
}

function buildGeneratedAt(now: () => Date): string {
  return now().toISOString();
}

export async function runEtfQuote(
  input: EtfInput,
  providers: EtfProviderMap = createProviderMap(),
  now: () => Date = () => new Date()
): Promise<EtfQuoteResponse> {
  const normalized = normalizeEtfInput(input, "eastmoney");
  try {
    const data = await providers[normalized.provider].quote(normalized);
    return {
      source: normalized.provider,
      symbol: normalized.symbol,
      normalizedSymbol: normalized.normalizedSymbol.prefixed,
      generatedAt: buildGeneratedAt(now),
      data
    };
  } catch (error) {
    throw formatProviderError(normalized.provider, error);
  }
}

export async function runEtfKline(
  input: EtfKlineInput,
  providers: EtfProviderMap = createProviderMap(),
  now: () => Date = () => new Date()
): Promise<EtfKlineResponse> {
  const normalized = normalizeEtfKlineInput(input, "eastmoney");
  try {
    const data = await providers[normalized.provider].kline(normalized);
    return {
      source: normalized.provider,
      symbol: normalized.symbol,
      normalizedSymbol: normalized.normalizedSymbol.prefixed,
      generatedAt: buildGeneratedAt(now),
      days: normalized.days,
      count: data.length,
      data
    };
  } catch (error) {
    throw formatProviderError(normalized.provider, error);
  }
}

export async function runEtfAnalyze(
  input: EtfKlineInput,
  providers: EtfProviderMap = createProviderMap(),
  now: () => Date = () => new Date()
): Promise<EtfAnalyzeResponse> {
  const normalized = normalizeEtfKlineInput(input, "xueqiu");
  const provider = providers[normalized.provider];
  try {
    const [quote, kline] = await Promise.all([
      provider.quote(normalized),
      provider.kline({ ...normalized, days: Math.max(normalized.days, 30) })
    ]);

    const closes = kline.map((item) => item.close);
    const current = closes.at(-1);
    if (current === undefined) {
      throw new Error("empty kline data");
    }

    const ma5 = calculateAverage(closes.slice(-5));
    const ma10 = calculateAverage(closes.slice(-10));
    const ma20 = calculateAverage(closes.slice(-20));
    const highs = kline.slice(-30).map((item) => item.high);
    const lows = kline.slice(-30).map((item) => item.low);

    return {
      source: normalized.provider,
      symbol: normalized.symbol,
      normalizedSymbol: normalized.normalizedSymbol.prefixed,
      generatedAt: buildGeneratedAt(now),
      quote,
      indicators: {
        current,
        ma5,
        ma10,
        ma20,
        high30: Math.max(...highs),
        low30: Math.min(...lows),
        trend: getTrend(current, ma5, ma10)
      },
      recentKlines: kline.slice(-10)
    };
  } catch (error) {
    throw formatProviderError(normalized.provider, error);
  }
}

export async function runEtfList(
  input: EtfListInput = {},
  providers: EtfProviderMap = createProviderMap(),
  now: () => Date = () => new Date()
): Promise<EtfListResponse> {
  const normalized = normalizeEtfListInput(input);
  const provider = providers.eastmoney;
  if (!provider.list) {
    throw new Error("eastmoney provider does not support list");
  }

  try {
    const data = await provider.list(normalized);
    return {
      source: "eastmoney",
      generatedAt: buildGeneratedAt(now),
      limit: normalized.limit,
      count: data.length,
      data
    };
  } catch (error) {
    throw formatProviderError("eastmoney", error);
  }
}

export function buildKlineCloses(points: EtfKlinePoint[]): number[] {
  return points.map((item) => item.close);
}
