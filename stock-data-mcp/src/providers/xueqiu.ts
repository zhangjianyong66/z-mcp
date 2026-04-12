import { getXueqiuConfig, withTimeout } from "../config.js";
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

let cachedCookie: string | null = null;
let cookieFetchedAtMs = 0;

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

export async function resolveXueqiuCookie(): Promise<string> {
  const cfg = getXueqiuConfig();
  if (cfg.cookie) {
    return cfg.cookie;
  }

  if (cachedCookie && Date.now() - cookieFetchedAtMs < XUEQIU_COOKIE_TTL_MS) {
    return cachedCookie;
  }

  const cookie = await cookieLoader();
  if (!cookie.trim()) {
    throw new Error("automatic cookie bootstrap returned an empty cookie string");
  }
  cachedCookie = cookie;
  cookieFetchedAtMs = Date.now();
  return cookie;
}

async function createHeaders(): Promise<Record<string, string>> {
  const cfg = getXueqiuConfig();
  return {
    "User-Agent": cfg.userAgent,
    Referer: XUEQIU_HOME_URL,
    Cookie: await resolveXueqiuCookie(),
    Accept: "application/json,text/plain,*/*"
  };
}

async function fetchJson(url: string, params: Record<string, string | number>, timeoutMs: number): Promise<unknown> {
  const search = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)])
  );
  const response = await fetch(`${url}?${search.toString()}`, {
    headers: await createHeaders(),
    signal: withTimeout(timeoutMs)
  });

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
      open: Number(row[1] ?? 0),
      close: Number(row[2] ?? 0),
      high: Number(row[3] ?? 0),
      low: Number(row[4] ?? 0),
      volume: typeof row[5] === "number" ? row[5] : null,
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
