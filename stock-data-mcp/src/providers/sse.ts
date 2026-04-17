import { withTimeout } from "../config.js";
import { logStockDataEvent } from "../logging.js";
import type {
  EtfListItem,
  EtfListPage,
  NormalizedEtfListInput,
  StockDataLogContext
} from "../types.js";

const SSE_LIST_URL = "https://query.sse.com.cn/commonQuery.do";
const SSE_REFERER = "https://etf.sse.com.cn/fundlist/";

type SseListItem = Record<string, string | number | null | undefined>;

type SseListPayload = {
  result?: SseListItem[] | null;
  pageHelp?: {
    total?: number | null;
  } | null;
  jsonCallBack?: string | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function inferMarketFromCode(code: string): "SH" | "SZ" {
  return code.startsWith("5") || code.startsWith("6") ? "SH" : "SZ";
}

function mapSseListItem(item: SseListItem): EtfListItem | null {
  const symbol = typeof item.FUND_CODE === "string" ? item.FUND_CODE.trim() : "";
  const name = typeof item.FUND_ABBR === "string" ? item.FUND_ABBR.trim() : "";
  if (!symbol || !name) {
    return null;
  }

  const market = inferMarketFromCode(symbol);
  return {
    symbol,
    name,
    market,
    normalizedSymbol: `${market}${symbol}`,
    secid: `${market === "SH" ? 1 : 0}.${symbol}`,
    fundAbbr: name,
    fundExpansionAbbr: typeof item.FUND_EXPANSION_ABBR === "string" ? item.FUND_EXPANSION_ABBR.trim() : undefined,
    companyName: typeof item.COMPANY_NAME === "string" ? item.COMPANY_NAME.trim() : undefined,
    companyCode: typeof item.COMPANY_CODE === "string" ? item.COMPANY_CODE.trim() : undefined,
    indexName: typeof item.INDEX_NAME === "string" ? item.INDEX_NAME.trim() : undefined,
    listingDate: typeof item.LISTING_DATE === "string" ? item.LISTING_DATE.trim() : undefined,
    category: typeof item.CATEGORY === "string" ? item.CATEGORY.trim() : undefined,
    scale: toNumber(item.SCALE),
    price: null,
    changePercent: null,
    changeAmount: null,
    volume: null,
    amount: null,
    open: null,
    high: null,
    low: null,
    prevClose: null,
    amplitude: null,
    turnoverRate: null,
    volumeRatio: null,
    peRatio: null,
    pbRatio: null,
    totalMarketValue: null,
    circulationMarketValue: null,
    change60d: null,
    changeYtd: null
  };
}

async function fetchJson(url: string, params: Record<string, string | number>, timeoutMs: number): Promise<SseListPayload> {
  const search = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)])
  );
  const response = await fetch(`${url}?${search.toString()}`, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: SSE_REFERER,
      Accept: "application/json,text/plain,*/*"
    },
    signal: withTimeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const trimmed = text.trim();
  const jsonText =
    trimmed.startsWith("(") && trimmed.endsWith(")")
      ? trimmed.slice(1, -1)
      : trimmed;

  return JSON.parse(jsonText) as SseListPayload;
}

async function list(input: NormalizedEtfListInput, context?: StockDataLogContext): Promise<EtfListPage> {
  logStockDataEvent("sse.list", {
    requestId: context?.requestId,
    page: input.page,
    pageSize: input.pageSize
  });
  const payload = await fetchJson(
    SSE_LIST_URL,
    {
      isPagination: "true",
      sqlId: "COMMON_JJZWZ_JJLB_L",
      "pageHelp.pageNo": input.page,
      "pageHelp.pageSize": input.pageSize,
      "pageHelp.beginPage": input.page,
      "pageHelp.endPage": input.page,
      "pageHelp.cacheSize": 1,
      type: "inParams",
      CATEGORY: "F100"
    },
    input.timeoutMs
  );

  const rows = payload.result ?? [];
  const items = (rows ?? []).map(mapSseListItem).filter((item): item is EtfListItem => item !== null);

  if (items.length === 0) {
    throw new Error("sse list returned empty data");
  }

  return {
    total: toNumber(payload.pageHelp?.total) ?? items.length,
    items
  };
}

export function createSseProvider(): { list: typeof list } {
  return {
    list
  };
}
