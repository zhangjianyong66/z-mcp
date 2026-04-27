import { formatProviderError } from "./config.js";
import { logStockDataEvent } from "./logging.js";
import { createAkshareProvider } from "./providers/akshare.js";
import { createXueqiuProvider } from "./providers/xueqiu.js";
import {
  calculateMarketScores,
  calculateNewsScores,
  fetchFinanceNewsTitles
} from "./sector-hotness.js";
import {
  normalizeEtfInput,
  normalizeEtfKlineInput,
  normalizeSectorListInput
} from "./symbol.js";
import type {
  EtfAnalyzeResponse,
  EtfInput,
  EtfKlineInput,
  EtfKlinePoint,
  EtfKlineResponse,
  EtfProviderMap,
  EtfQuoteResponse,
  SectorListInput,
  SectorListItem,
  SectorListResponse,
  SectorProviderApi,
  SectorSnapshotItem,
  StockDataLogContext
} from "./types.js";

export function createProviderMap(): EtfProviderMap {
  return {
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
  now: () => Date = () => new Date(),
  context?: StockDataLogContext
): Promise<EtfQuoteResponse> {
  const normalized = normalizeEtfInput(input, "xueqiu");
  try {
    const data = await providers[normalized.provider].quote(normalized, context);
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
  now: () => Date = () => new Date(),
  context?: StockDataLogContext
): Promise<EtfKlineResponse> {
  const normalized = normalizeEtfKlineInput(input, "xueqiu");
  try {
    const data = await providers[normalized.provider].kline(normalized, context);
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
  now: () => Date = () => new Date(),
  context?: StockDataLogContext
): Promise<EtfAnalyzeResponse> {
  const normalized = normalizeEtfKlineInput(input, "xueqiu");
  const provider = providers[normalized.provider];
  try {
    const [quote, kline] = await Promise.all([
      provider.quote(normalized, context),
      provider.kline({ ...normalized, days: Math.max(normalized.days, 30) }, context)
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

export function buildKlineCloses(points: EtfKlinePoint[]): number[] {
  return points.map((item) => item.close);
}

function compareNullableNumber(left: number | null, right: number | null, direction: "asc" | "desc"): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  const delta = left - right;
  return direction === "asc" ? delta : -delta;
}

function sortSectorItems(items: SectorListItem[], sortBy: NonNullable<SectorListInput["sortBy"]>): SectorListItem[] {
  const direction: "asc" | "desc" = sortBy === "losers" ? "asc" : "desc";

  return [...items].sort((left, right) => {
    if (sortBy === "hot") {
      const hotDelta = compareNullableNumber(left.hotScore, right.hotScore, "desc");
      if (hotDelta !== 0) {
        return hotDelta;
      }
      const fallback = compareNullableNumber(left.changePercent, right.changePercent, "desc");
      if (fallback !== 0) {
        return fallback;
      }
      return left.sectorName.localeCompare(right.sectorName, "zh-CN");
    }

    const delta = compareNullableNumber(left.changePercent, right.changePercent, direction);
    if (delta !== 0) {
      return delta;
    }

    return left.sectorName.localeCompare(right.sectorName, "zh-CN");
  });
}

export type SectorListDependencies = {
  provider?: SectorProviderApi;
  newsFetcher?: (timeoutMs: number) => Promise<string[]>;
};

export async function runSectorList(
  input: SectorListInput = {},
  dependencies: SectorListDependencies = {},
  now: () => Date = () => new Date(),
  context?: StockDataLogContext
): Promise<SectorListResponse> {
  const normalized = normalizeSectorListInput(input);
  const provider = dependencies.provider ?? createAkshareProvider();
  const newsFetcher = dependencies.newsFetcher ?? fetchFinanceNewsTitles;

  logStockDataEvent("sector_list.start", {
    requestId: context?.requestId,
    input: {
      page: normalized.page,
      pageSize: normalized.pageSize,
      sortBy: normalized.sortBy,
      timeoutMs: normalized.timeoutMs
    }
  });

  const baseItems = await provider.listIndustrySummary(normalized, context);
  if (!baseItems.length) {
    throw new Error("sector list is empty");
  }

  const marketScores = calculateMarketScores(baseItems);
  let newsScores = new Array(baseItems.length).fill(0);
  let newsScoreDegraded = false;

  try {
    const newsTitles = await newsFetcher(normalized.timeoutMs);
    if (newsTitles.length > 0) {
      newsScores = calculateNewsScores(baseItems, newsTitles);
    } else {
      newsScoreDegraded = true;
    }
  } catch (error) {
    newsScoreDegraded = true;
    logStockDataEvent("sector_list.news_error", {
      requestId: context?.requestId,
      error: error instanceof Error ? error.message : String(error)
    }, "notice");
  }

  const computed: SectorListItem[] = baseItems.map((item: SectorSnapshotItem, index) => {
    const marketScore = marketScores[index] ?? 0;
    const newsScore = newsScores[index] ?? 0;
    const hotScore = Number((0.7 * marketScore + 0.3 * newsScore).toFixed(6));
    return {
      ...item,
      marketScore,
      newsScore,
      hotScore
    };
  });

  const sorted = sortSectorItems(computed, normalized.sortBy);
  const total = sorted.length;
  const start = (normalized.page - 1) * normalized.pageSize;
  const end = start + normalized.pageSize;
  const pageData = sorted.slice(start, end);
  const hasMore = end < total;

  const response: SectorListResponse = {
    source: "akshare_ths",
    generatedAt: buildGeneratedAt(now),
    sortBy: normalized.sortBy,
    page: normalized.page,
    pageSize: normalized.pageSize,
    limit: normalized.limit,
    total,
    count: pageData.length,
    hasMore,
    newsScoreDegraded,
    data: pageData
  };

  logStockDataEvent("sector_list.success", {
    requestId: context?.requestId,
    sortBy: response.sortBy,
    page: response.page,
    pageSize: response.pageSize,
    total: response.total,
    count: response.count,
    hasMore: response.hasMore,
    newsScoreDegraded: response.newsScoreDegraded
  });

  return response;
}
