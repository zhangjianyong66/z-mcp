import { withTimeout } from "../config.js";
import type {
  EtfListItem,
  EtfProviderApi,
  EtfQuote,
  EtfKlinePoint,
  NormalizedEtfInput,
  NormalizedEtfKlineInput,
  NormalizedEtfListInput
} from "../types.js";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*"
} as const;

const EASTMONEY_QUOTE_URL = "https://push2.eastmoney.com/api/qt/stock/get";
const EASTMONEY_KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get";
const EASTMONEY_LIST_URL = "https://push2.eastmoney.com/api/qt/clist/get";
const EASTMONEY_ETF_LIST_FS = "b:MK0021,b:MK0022,b:MK0023,b:MK0024";

type EastmoneyListItem = Record<string, number | string | null | undefined>;
type EastmoneyListPayload = {
  rc?: number;
  data?: {
    diff?: EastmoneyListItem[] | null;
  } | null;
};

function scaledPrice(value: unknown): number | null {
  return typeof value === "number" ? value / 100 : null;
}

function scaledAmount(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

async function fetchJson(url: string, params: Record<string, string | number>, timeoutMs: number): Promise<unknown> {
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

  return response.json();
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
  return {
    symbol: typeof item.f12 === "string" ? item.f12 : "",
    name: typeof item.f14 === "string" ? item.f14 : "",
    price: typeof item.f2 === "number" ? item.f2 : null,
    changePercent: typeof item.f3 === "number" ? item.f3 : null,
    changeAmount: typeof item.f4 === "number" ? item.f4 : null,
    volume: typeof item.f5 === "number" ? item.f5 : null,
    amount: typeof item.f6 === "number" ? item.f6 : null
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
  if (payload.rc !== 0) {
    throw new Error(`list API returned rc=${payload.rc ?? "unknown"}`);
  }

  const rows = payload.data?.diff;
  if (!rows?.length) {
    throw new Error("list API returned null or empty data");
  }

  return rows;
}

async function quote(input: NormalizedEtfInput): Promise<EtfQuote> {
  const payload = (await fetchJson(
    EASTMONEY_QUOTE_URL,
    {
      secid: input.normalizedSymbol.secid,
      fields: "f43,f44,f45,f46,f47,f48,f58,f60,f168,f169,f170"
    },
    input.timeoutMs
  )) as { data?: Record<string, unknown> | null };

  if (!payload.data) {
    throw new Error("empty quote data");
  }

  return mapEastmoneyQuote(payload.data, input.normalizedSymbol.code);
}

async function kline(input: NormalizedEtfKlineInput): Promise<EtfKlinePoint[]> {
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
    input.timeoutMs
  )) as { data?: { klines?: string[] | null } | null };

  const rows = payload.data?.klines;
  if (!rows?.length) {
    throw new Error("empty kline data");
  }

  return parseEastmoneyKlines(rows);
}

async function list(input: NormalizedEtfListInput): Promise<EtfListItem[]> {
  const payload = (await fetchJson(
    EASTMONEY_LIST_URL,
    {
      pn: 1,
      pz: input.limit,
      po: 1,
      np: 1,
      fltt: 2,
      invt: 2,
      fid: "f3",
      fs: EASTMONEY_ETF_LIST_FS,
      fields: "f12,f14,f2,f3,f4,f5,f6"
    },
    input.timeoutMs
  )) as EastmoneyListPayload;

  const rows = extractEastmoneyListRows(payload);

  return rows.map(mapEastmoneyListItem).filter((item) => item.symbol && item.name);
}

export function createEastmoneyProvider(): EtfProviderApi {
  return {
    quote,
    kline,
    list
  };
}
