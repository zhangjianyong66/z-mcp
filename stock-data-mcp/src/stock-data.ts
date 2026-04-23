import { formatProviderError } from "./config.js";
import { logStockDataEvent } from "./logging.js";
import { createAkshareProvider } from "./providers/akshare.js";
import { createEastmoneyProvider } from "./providers/eastmoney.js";
import { createSseProvider } from "./providers/sse.js";
import { createXueqiuProvider } from "./providers/xueqiu.js";
import {
  calculateMarketScores,
  calculateNewsScores,
  fetchFinanceNewsTitles
} from "./sector-hotness.js";
import {
  normalizeEtfInput,
  normalizeEtfKlineInput,
  normalizeEtfListInput,
  normalizeSectorListInput
} from "./symbol.js";
import type {
  EtfAnalyzeResponse,
  EtfInput,
  EtfKlineInput,
  EtfKlinePoint,
  EtfKlineResponse,
  EtfListInput,
  EtfListItem,
  EtfListResponse,
  EtfProviderMap,
  EtfQuoteResponse,
  EtfListSource,
  SectorListInput,
  SectorListItem,
  SectorListResponse,
  SectorProviderApi,
  SectorSnapshotItem,
  StockDataLogContext
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

function getListSourceUrl(source: Exclude<EtfListSource, "auto">): string {
  switch (source) {
    case "eastmoney":
      return "https://quote.eastmoney.com/center/gridlist.html#fund_etf";
    case "sse":
      return "https://english.sse.com.cn/access/etf/";
  }
}

type SortDirection = "asc" | "desc";

function getListSortDirection(sortBy: EtfListInput["sortBy"]): SortDirection {
  return sortBy === "losers" ? "asc" : "desc";
}

function getListSortValue(item: EtfListItem, sortBy: NonNullable<EtfListInput["sortBy"]>): number | null {
  switch (sortBy) {
    case "losers":
    case "gainers":
      return item.changePercent;
    case "volume":
      return item.volume;
    case "amount":
      return item.amount;
    case "turnoverRate":
      return item.turnoverRate;
    default:
      return item.changePercent;
  }
}

function compareListItems(
  left: EtfListItem,
  right: EtfListItem,
  sortBy: NonNullable<EtfListInput["sortBy"]>
): number {
  const direction = getListSortDirection(sortBy);
  const leftValue = getListSortValue(left, sortBy);
  const rightValue = getListSortValue(right, sortBy);

  if (leftValue === null && rightValue === null) {
    return left.symbol.localeCompare(right.symbol);
  }
  if (leftValue === null) {
    return 1;
  }
  if (rightValue === null) {
    return -1;
  }

  const delta = leftValue - rightValue;
  if (delta !== 0) {
    return direction === "asc" ? delta : -delta;
  }

  return left.symbol.localeCompare(right.symbol);
}

function sortListItems(items: EtfListItem[], sortBy: NonNullable<EtfListInput["sortBy"]>): EtfListItem[] {
  return [...items].sort((left, right) => compareListItems(left, right, sortBy));
}

function formatListProviderError(provider: Exclude<EtfListSource, "auto">, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${provider} request failed: ${message}`);
}

async function fetchEtfListPages(
  provider: NonNullable<EtfProviderMap["eastmoney"]["list"]>,
  input: ReturnType<typeof normalizeEtfListInput>,
  requestId: string | undefined,
  startPage = 1
): Promise<{ total: number; items: EtfListItem[] }> {
  const items: EtfListItem[] = [];
  let total: number | null = null;
  let page = startPage;

  while (true) {
    logStockDataEvent("etf_list.page_start", {
      requestId,
      page,
      pageSize: input.pageSize,
      sortBy: input.sortBy,
      fetchAll: input.fetchAll
    });
    try {
      const result = await provider({
        ...input,
        page
      }, { requestId });
      logStockDataEvent("etf_list.page_success", {
        requestId,
        page,
        pageSize: input.pageSize,
        total: result.total,
        items: result.items.length
      });

      if (total === null && typeof result.total === "number") {
        total = result.total;
      }

      items.push(...result.items);

      if (result.items.length < input.pageSize) {
        break;
      }

      if (total !== null && page * input.pageSize >= total) {
        break;
      }

      page += 1;
    } catch (error) {
      logStockDataEvent("etf_list.page_error", {
        requestId,
        page,
        pageSize: input.pageSize,
        error: error instanceof Error ? error.message : String(error)
      }, "error");
      throw error;
    }
  }

  return {
    total: total ?? items.length,
    items
  };
}

export async function runEtfQuote(
  input: EtfInput,
  providers: EtfProviderMap = createProviderMap(),
  now: () => Date = () => new Date(),
  context?: StockDataLogContext
): Promise<EtfQuoteResponse> {
  const normalized = normalizeEtfInput(input, "eastmoney");
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
  const normalized = normalizeEtfKlineInput(input, "eastmoney");
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

export async function runEtfList(
  input: EtfListInput = {},
  providers: EtfProviderMap = createProviderMap(),
  now: () => Date = () => new Date(),
  context?: { requestId?: string }
): Promise<EtfListResponse> {
  const normalized = normalizeEtfListInput(input);
  const sseProvider = createSseProvider();
  const eastmoneyProvider = providers.eastmoney;
  if (!eastmoneyProvider.list) {
    throw new Error("eastmoney provider does not support list");
  }

  logStockDataEvent("etf_list.start", {
    requestId: context?.requestId,
    input: {
      limit: input.limit,
      page: normalized.page,
      pageSize: normalized.pageSize,
      sortBy: normalized.sortBy,
      fetchAll: normalized.fetchAll,
      source: input.source ?? "auto",
      timeoutMs: normalized.timeoutMs
    }
  });

  const source = input.source ?? "auto";
  let resolvedSource: Exclude<EtfListSource, "auto"> = "eastmoney";
  let result: { total: number | null; items: EtfListItem[] };

  try {
    if (source === "sse") {
      resolvedSource = "sse";
      result = normalized.fetchAll
        ? await fetchEtfListPages(sseProvider.list, normalized, context?.requestId, 1)
        : await sseProvider.list(normalized, context);
    } else {
      try {
        resolvedSource = "eastmoney";
        result = normalized.fetchAll
          ? await fetchEtfListPages(eastmoneyProvider.list!, normalized, context?.requestId, 1)
          : await eastmoneyProvider.list!(normalized, context);
      } catch (error) {
        if (source === "eastmoney") {
          throw formatListProviderError("eastmoney", error);
        }
        logStockDataEvent("etf_list.fallback", {
          requestId: context?.requestId,
          from: "eastmoney",
          to: "sse",
          reason: error instanceof Error ? error.message : String(error)
        }, "notice");
        try {
          resolvedSource = "sse";
          result = normalized.fetchAll
            ? await fetchEtfListPages(sseProvider.list, normalized, context?.requestId, 1)
            : await sseProvider.list(normalized, context);
        } catch (fallbackError) {
          throw formatListProviderError("sse", fallbackError);
        }
      }
    }

    const items = sortListItems(result.items, normalized.sortBy);
    const total = result.total;
    const resolvedTotal = total ?? items.length;
    const hasMore = normalized.fetchAll ? false : total !== null
      ? normalized.page * normalized.pageSize < total
      : items.length === normalized.pageSize;
    const response: EtfListResponse = {
      source: resolvedSource,
      sourceUrl: getListSourceUrl(resolvedSource),
      sourceQuery: {
        page: normalized.page,
        pageSize: normalized.pageSize,
        sortBy: normalized.sortBy
      },
      generatedAt: buildGeneratedAt(now),
      sortBy: normalized.sortBy,
      fetchAll: normalized.fetchAll,
      page: normalized.fetchAll ? 1 : normalized.page,
      pageSize: normalized.pageSize,
      limit: normalized.limit,
      total: resolvedTotal,
      count: items.length,
      hasMore,
      data: items
    };
    logStockDataEvent("etf_list.success", {
      requestId: context?.requestId,
      page: response.page,
      pageSize: response.pageSize,
      total: response.total,
      count: response.count,
      hasMore: response.hasMore,
      fetchAll: response.fetchAll
    });
    return response;
  } catch (error) {
    logStockDataEvent("etf_list.error", {
      requestId: context?.requestId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

export function buildKlineCloses(points: EtfKlinePoint[]): number[] {
  return points.map((item) => item.close);
}

function compareNullableNumber(left: number | null, right: number | null, direction: SortDirection): number {
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
  const direction: SortDirection = sortBy === "losers" ? "asc" : "desc";

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
