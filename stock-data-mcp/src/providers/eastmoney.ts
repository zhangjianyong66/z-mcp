import { withTimeout } from "../config.js";
import { logStockDataEvent } from "../logging.js";
import { normalizeSymbol } from "../symbol.js";
import type {
  EtfListItem,
  EtfListPage,
  EtfProviderApi,
  EtfQuote,
  EtfKlinePoint,
  NormalizedEtfInput,
  NormalizedEtfKlineInput,
  NormalizedEtfListInput,
  StockDataLogContext
} from "../types.js";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*"
} as const;

const EASTMONEY_QUOTE_URL = "https://push2.eastmoney.com/api/qt/stock/get";
const EASTMONEY_KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get";
const EASTMONEY_LIST_URL = "https://push2.eastmoney.com/api/qt/clist/get";
const EASTMONEY_ETF_LIST_FS = "b:MK0021,b:MK0022,b:MK0023,b:MK0024,b:MK0827";
const EASTMONEY_ETF_LIST_FIELDS =
  "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13,f14,f15,f16,f17,f18,f20,f21,f22,f23,f24,f25,f26,f62,f115,f128,f136,f152";
const EASTMONEY_ETF_LIST_UT = "bd1d9ddb04089700cf9c27f6f7426281";

type EastmoneyListItem = Record<string, number | string | null | undefined>;
type EastmoneyListPayload = {
  rc?: number;
  data?: {
    total?: number | null;
    diff?: EastmoneyListItem[] | null;
  } | null;
};

function scaledPrice(value: unknown): number | null {
  return typeof value === "number" ? value / 100 : null;
}

function scaledAmount(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function scaledPermille(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value / 1000 : null;
}

function scaledPercent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value / 100 : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveIntegerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function safeNormalizeSymbol(symbol: string): ReturnType<typeof normalizeSymbol> | null {
  try {
    return normalizeSymbol(symbol);
  } catch {
    return null;
  }
}

async function fetchJson(
  url: string,
  params: Record<string, string | number>,
  timeoutMs: number,
  context?: StockDataLogContext
): Promise<unknown> {
  logStockDataEvent(
    "eastmoney.request",
    {
      requestId: context?.requestId,
      url,
      params
    },
    "debug"
  );
  const search = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)])
  );
  const response = await fetch(`${url}?${search.toString()}`, {
    headers: REQUEST_HEADERS,
    signal: withTimeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  logStockDataEvent(
    "eastmoney.response",
    {
      requestId: context?.requestId,
      url,
      ok: true
    },
    "debug"
  );
  return json;
}

export function mapEastmoneyQuote(data: Record<string, unknown>, symbol: string): EtfQuote {
  return {
    symbol,
    name: typeof data.f58 === "string" ? data.f58 : undefined,
    price: scaledPrice(data.f43),
    changePercent: scaledPrice(data.f170),
    changeAmount: scaledPrice(data.f169),
    open: scaledPrice(data.f46),
    high: scaledPrice(data.f44),
    low: scaledPrice(data.f45),
    prevClose: scaledPrice(data.f60),
    volume: scaledAmount(data.f47),
    amount: scaledAmount(data.f48),
    turnoverRate: typeof data.f168 === "number" ? data.f168 / 100 : null
  };
}

export function mapEastmoneyListItem(item: EastmoneyListItem): EtfListItem {
  const symbol = typeof item.f12 === "string" ? item.f12 : "";
  const normalized = symbol ? safeNormalizeSymbol(symbol) : null;

  return {
    symbol,
    name: typeof item.f14 === "string" ? item.f14 : "",
    market: normalized?.market ?? "SZ",
    normalizedSymbol: normalized?.prefixed ?? symbol,
    secid: normalized?.secid ?? "",
    fundAbbr: typeof item.f14 === "string" ? item.f14 : undefined,
    price: scaledPermille(item.f2),
    changePercent: scaledPercent(item.f3),
    changeAmount: scaledPermille(item.f4),
    volume: typeof item.f5 === "number" ? item.f5 : null,
    amount: typeof item.f6 === "number" ? item.f6 : null,
    open: scaledPermille(item.f17),
    high: scaledPermille(item.f15),
    low: scaledPermille(item.f16),
    prevClose: scaledPermille(item.f18),
    amplitude: scaledPercent(item.f7),
    turnoverRate: scaledPercent(item.f8),
    volumeRatio: scaledPercent(item.f10),
    peRatio: numberOrNull(item.f9),
    pbRatio: numberOrNull(item.f23),
    totalMarketValue: numberOrNull(item.f20),
    circulationMarketValue: numberOrNull(item.f21),
    change60d: scaledPercent(item.f24),
    changeYtd: scaledPercent(item.f25)
  };
}

export function parseEastmoneyKlines(klines: string[]): EtfKlinePoint[] {
  return klines.map((row) => {
    const parts = row.split(",");
    return {
      date: parts[0]!,
      open: Number(parts[1]),
      close: Number(parts[2]),
      high: Number(parts[3]),
      low: Number(parts[4]),
      volume: Number.isFinite(Number(parts[5])) ? Number(parts[5]) : null,
      changePercent: Number.isFinite(Number(parts[8])) ? Number(parts[8]) : null
    };
  });
}

export function extractEastmoneyListRows(payload: EastmoneyListPayload): EastmoneyListItem[] {
  return extractEastmoneyListPage(payload).items;
}

export function extractEastmoneyListPage(payload: EastmoneyListPayload): {
  total: number | null;
  items: EastmoneyListItem[];
} {
  if (payload.rc !== 0) {
    throw new Error(`list API returned rc=${payload.rc ?? "unknown"}`);
  }

  const rows = payload.data?.diff;
  if (!rows?.length) {
    throw new Error("list API returned null or empty data");
  }

  return {
    total: positiveIntegerOrNull(payload.data?.total),
    items: rows
  };
}

function resolveListSort(input: NormalizedEtfListInput): { fid: string; po: 0 | 1 } {
  switch (input.sortBy) {
    case "losers":
      return { fid: "f3", po: 0 };
    case "volume":
      return { fid: "f5", po: 1 };
    case "amount":
      return { fid: "f6", po: 1 };
    case "turnoverRate":
      return { fid: "f8", po: 1 };
    case "gainers":
    default:
      return { fid: "f3", po: 1 };
  }
}

async function quote(input: NormalizedEtfInput, context?: StockDataLogContext): Promise<EtfQuote> {
  const payload = (await fetchJson(
    EASTMONEY_QUOTE_URL,
    {
      secid: input.normalizedSymbol.secid,
      fields: "f43,f44,f45,f46,f47,f48,f58,f60,f168,f169,f170"
    },
    input.timeoutMs,
    context
  )) as { data?: Record<string, unknown> | null };

  if (!payload.data) {
    throw new Error("empty quote data");
  }

  return mapEastmoneyQuote(payload.data, input.normalizedSymbol.code);
}

async function kline(input: NormalizedEtfKlineInput, context?: StockDataLogContext): Promise<EtfKlinePoint[]> {
  const payload = (await fetchJson(
    EASTMONEY_KLINE_URL,
    {
      secid: input.normalizedSymbol.secid,
      fields1: "f1,f2,f3,f4,f5,f6",
      fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59",
      klt: 101,
      fqt: 1,
      end: "20500101",
      lmt: input.days
    },
    input.timeoutMs,
    context
  )) as { data?: { klines?: string[] | null } | null };

  const rows = payload.data?.klines;
  if (!rows?.length) {
    throw new Error("empty kline data");
  }

  return parseEastmoneyKlines(rows);
}

async function list(input: NormalizedEtfListInput, context?: StockDataLogContext): Promise<EtfListPage> {
  const sort = resolveListSort(input);
  logStockDataEvent(
    "eastmoney.list",
    {
      requestId: context?.requestId,
      page: input.page,
      pageSize: input.pageSize,
      sortBy: input.sortBy,
      fid: sort.fid,
      po: sort.po
    },
    "debug"
  );
  const payload = (await fetchJson(
    EASTMONEY_LIST_URL,
    {
      pn: input.page,
      pz: input.pageSize,
      po: sort.po,
      np: 1,
      fltt: 1,
      invt: 2,
      ut: EASTMONEY_ETF_LIST_UT,
      wbp2u: "|0|0|0|web",
      dect: 1,
      fid: sort.fid,
      fs: EASTMONEY_ETF_LIST_FS,
      fields: EASTMONEY_ETF_LIST_FIELDS
    },
    input.timeoutMs,
    context
  )) as EastmoneyListPayload;

  const page = extractEastmoneyListPage(payload);
  logStockDataEvent(
    "eastmoney.list_page",
    {
      requestId: context?.requestId,
      page: input.page,
      total: page.total,
      items: page.items.length
    },
    "debug"
  );

  return {
    total: page.total,
    items: page.items.map(mapEastmoneyListItem).filter((item) => item.symbol && item.name)
  };
}

export function createEastmoneyProvider(): EtfProviderApi {
  return {
    quote,
    kline,
    list
  };
}
