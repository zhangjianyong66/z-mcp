import { getXueqiuConfig, withTimeout } from "../config.js";
import { logStockDataEvent } from "../logging.js";
import type {
  EtfProviderApi,
  EtfQuote,
  EtfKlinePoint,
  NormalizedEtfInput,
  NormalizedEtfKlineInput
} from "../types.js";

const XUEQIU_QUOTE_URL = "https://stock.xueqiu.com/v5/stock/realtime/quotec.json";
const XUEQIU_KLINE_URL = "https://stock.xueqiu.com/v5/stock/chart/kline.json";
const XUEQIU_HOME_URL = "https://xueqiu.com/";
const XUEQIU_COOKIE_TTL_MS = 30 * 60 * 1000;

type CookieLoader = () => Promise<string>;
type CookieSource = "env" | "auto-cache" | "auto-fresh";
type FetchLike = typeof fetch;
type XueqiuAuthErrorDetails = {
  authStatus: number;
  cookieSource: CookieSource;
  refreshed: boolean;
  retryAttempt: number;
};

let cachedCookie: string | null = null;
let cookieFetchedAtMs = 0;
let fetchImpl: FetchLike = fetch;

function serializeCookies(cookies: Array<{ name: string; value: string }>): string {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function loadCookieWithPlaywright(): Promise<string> {
  let chromium: {
    launch: (options?: Record<string, unknown>) => Promise<{
      newContext: (options?: Record<string, unknown>) => Promise<{
        newPage: () => Promise<{
          goto: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
          waitForTimeout: (timeout: number) => Promise<void>;
        }>;
        cookies: () => Promise<Array<{ name: string; value: string }>>;
        close: () => Promise<void>;
      }>;
      close: () => Promise<void>;
    }>;
  };

  try {
    ({ chromium } = await import("playwright"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `automatic cookie bootstrap requires playwright: ${message}. Run npm install and, if needed, npx playwright install chromium`
    );
  }

  const launchAttempts: Array<Record<string, unknown>> = [
    { headless: true, args: ["--disable-blink-features=AutomationControlled"] },
    { headless: true, channel: "chrome", args: ["--disable-blink-features=AutomationControlled"] }
  ];

  let lastError: unknown = null;
  for (const launchOptions of launchAttempts) {
    try {
      const browser = await chromium.launch(launchOptions);
      try {
        const context = await browser.newContext({
          userAgent: getXueqiuConfig().userAgent,
          viewport: { width: 1440, height: 900 },
          javaScriptEnabled: true
        });
        try {
          const page = await context.newPage();
          try {
            await page.goto(XUEQIU_HOME_URL, { waitUntil: "domcontentloaded", timeout: 20_000 });
          } catch {
            await page.goto("https://xueqiu.com/S/SZ159930", { waitUntil: "domcontentloaded", timeout: 15_000 });
          }
          await page.waitForTimeout(2_000);
          const cookies = await context.cookies();
          const serialized = serializeCookies(cookies);
          if (!serialized) {
            throw new Error("playwright fetched no cookies from xueqiu");
          }
          return serialized;
        } finally {
          await context.close();
        }
      } finally {
        await browser.close();
      }
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`automatic cookie bootstrap failed: ${message}`);
}

let cookieLoader: CookieLoader = loadCookieWithPlaywright;

export function clearXueqiuCookieCache(): void {
  cachedCookie = null;
  cookieFetchedAtMs = 0;
}

export function setXueqiuCookieLoaderForTests(loader?: CookieLoader): void {
  cookieLoader = loader ?? loadCookieWithPlaywright;
  clearXueqiuCookieCache();
}

export function setXueqiuFetchForTests(nextFetch?: FetchLike): void {
  fetchImpl = nextFetch ?? fetch;
}

async function resolveXueqiuCookieWithSource(forceRefresh = false): Promise<{ cookie: string; source: CookieSource }> {
  const cfg = getXueqiuConfig();
  if (cfg.cookie) {
    return { cookie: cfg.cookie, source: "env" };
  }

  if (!forceRefresh && cachedCookie && Date.now() - cookieFetchedAtMs < XUEQIU_COOKIE_TTL_MS) {
    return { cookie: cachedCookie, source: "auto-cache" };
  }

  const cookie = await cookieLoader();
  if (!cookie.trim()) {
    throw new Error("automatic cookie bootstrap returned an empty cookie string");
  }
  cachedCookie = cookie;
  cookieFetchedAtMs = Date.now();
  return { cookie, source: "auto-fresh" };
}

export async function resolveXueqiuCookie(): Promise<string> {
  const resolved = await resolveXueqiuCookieWithSource();
  return resolved.cookie;
}

export async function warmXueqiuCookie(): Promise<void> {
  try {
    await resolveXueqiuCookie();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[stock-data-mcp] xueqiu cookie warm failed: ${message}`);
  }
}

async function createHeaders(forceRefresh = false): Promise<{ headers: Record<string, string>; cookieSource: CookieSource }> {
  const cfg = getXueqiuConfig();
  const resolved = await resolveXueqiuCookieWithSource(forceRefresh);
  return {
    headers: {
      "User-Agent": cfg.userAgent,
      Referer: XUEQIU_HOME_URL,
      Cookie: resolved.cookie,
      Accept: "application/json,text/plain,*/*"
    },
    cookieSource: resolved.source
  };
}

function buildXueqiuAuthError(
  message: string,
  details: XueqiuAuthErrorDetails
): Error {
  const error = new Error(message) as Error & { details?: XueqiuAuthErrorDetails };
  error.details = details;
  return error;
}

function isAuthStatus(status: number): boolean {
  return status === 401 || status === 403;
}

async function fetchJson(url: string, params: Record<string, string | number>, timeoutMs: number): Promise<unknown> {
  const search = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)])
  );
  const requestUrl = `${url}?${search.toString()}`;
  const firstAttempt = await createHeaders(false);
  let response = await fetchImpl(requestUrl, {
    headers: firstAttempt.headers,
    signal: withTimeout(timeoutMs)
  });

  if (!response.ok && isAuthStatus(response.status)) {
    if (firstAttempt.cookieSource === "env") {
      throw buildXueqiuAuthError(
        `xueqiu auth failed (${response.status} ${response.statusText}) using XUEQIU_COOKIE. Please refresh XUEQIU_COOKIE.`,
        { authStatus: response.status, cookieSource: "env", refreshed: false, retryAttempt: 0 }
      );
    }

    logStockDataEvent("xueqiu.auth_retry", {
      status: response.status,
      statusText: response.statusText,
      cookieSource: firstAttempt.cookieSource
    }, "notice");

    clearXueqiuCookieCache();
    const retryAttempt = await createHeaders(true);
    response = await fetchImpl(requestUrl, {
      headers: retryAttempt.headers,
      signal: withTimeout(timeoutMs)
    });

    if (!response.ok && isAuthStatus(response.status)) {
      logStockDataEvent("xueqiu.auth_retry_failed", {
        status: response.status,
        statusText: response.statusText,
        cookieSource: retryAttempt.cookieSource
      }, "warning");
      throw buildXueqiuAuthError(
        `xueqiu auth failed after cookie refresh (${response.status} ${response.statusText})`,
        { authStatus: response.status, cookieSource: retryAttempt.cookieSource, refreshed: true, retryAttempt: 1 }
      );
    }
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

export function mapXueqiuQuote(data: Record<string, unknown>, symbol: string): EtfQuote {
  return {
    symbol,
    name: typeof data.name === "string" ? data.name : undefined,
    price: typeof data.current === "number" ? data.current : null,
    changePercent: typeof data.percent === "number" ? data.percent : null,
    changeAmount: typeof data.chg === "number" ? data.chg : null,
    open: typeof data.open === "number" ? data.open : null,
    high: typeof data.high === "number" ? data.high : null,
    low: typeof data.low === "number" ? data.low : null,
    prevClose: typeof data.last_close === "number" ? data.last_close : null,
    volume: typeof data.volume === "number" ? data.volume : null,
    amount: typeof data.amount === "number" ? data.amount : null,
    turnoverRate: typeof data.turnover_rate === "number" ? data.turnover_rate : null
  };
}

export function parseXueqiuKlines(items: unknown[]): EtfKlinePoint[] {
  return items.map((item) => {
    const row = item as Array<number | null>;
    return {
      date: new Date((row[0] ?? 0) as number).toISOString().slice(0, 10),
      volume: typeof row[1] === "number" ? row[1] : null,
      open: Number(row[2] ?? 0),
      high: Number(row[3] ?? 0),
      low: Number(row[4] ?? 0),
      close: Number(row[5] ?? 0),
      changePercent: typeof row[7] === "number" ? row[7] : null
    };
  });
}

async function quote(input: NormalizedEtfInput): Promise<EtfQuote> {
  const payload = (await fetchJson(
    XUEQIU_QUOTE_URL,
    {
      symbol: input.normalizedSymbol.prefixed
    },
    input.timeoutMs
  )) as { data?: Array<Record<string, unknown>> | Record<string, unknown> | null };

  const data = Array.isArray(payload.data) ? payload.data[0] : payload.data;
  if (!data) {
    throw new Error("empty quote data");
  }

  return mapXueqiuQuote(data, input.normalizedSymbol.code);
}

async function kline(input: NormalizedEtfKlineInput): Promise<EtfKlinePoint[]> {
  const payload = (await fetchJson(
    XUEQIU_KLINE_URL,
    {
      symbol: input.normalizedSymbol.prefixed,
      period: "day",
      type: "before",
      count: `-${input.days}`,
      indicator: "kline",
      begin: Date.now()
    },
    input.timeoutMs
  )) as { data?: { item?: unknown[] | null } | null };

  const rows = payload.data?.item;
  if (!rows?.length) {
    throw new Error("empty kline data");
  }

  return parseXueqiuKlines(rows);
}

export function createXueqiuProvider(): EtfProviderApi {
  return {
    quote,
    kline
  };
}
