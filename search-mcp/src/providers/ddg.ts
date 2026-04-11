import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici";
import { withTimeout } from "../config.js";
import type { SearchResult } from "../types.js";

const DUCKDUCKGO_LITE_URL = "https://lite.duckduckgo.com/lite/";
let proxyDispatcher: EnvHttpProxyAgent | undefined;

export function parseDuckDuckGoHtml(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const seenUrls = new Set<string>();
  const pattern = /<a[^>]+href="\/\/duckduckgo\.com\/l\/\?uddg=([^"]+)"[^>]*>([^<]+)<\/a>/gi;

  for (const match of html.matchAll(pattern)) {
    const url = normalizeDuckDuckGoResultUrl(match[1] ?? "");
    const title = decodeHtmlEntity((match[2] ?? "").trim());
    if (!url.startsWith("http") || url.includes("duckduckgo.com") || !title || seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    results.push({
      title,
      url,
      snippet: "",
      provider: "ddg"
    });

    if (results.length >= maxResults) {
      break;
    }
  }

  return results;
}

function normalizeDuckDuckGoResultUrl(rawUrl: string): string {
  const decoded = decodeURIComponent(decodeHtmlEntity(rawUrl));
  const trackingIndex = decoded.search(/[?&](rut|rutenc)=/i);
  if (trackingIndex >= 0) {
    return decoded.slice(0, trackingIndex);
  }

  return decoded;
}

function decodeHtmlEntity(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function hasProxyEnv(): boolean {
  return Boolean(
    process.env.HTTP_PROXY ||
      process.env.HTTPS_PROXY ||
      process.env.ALL_PROXY ||
      process.env.http_proxy ||
      process.env.https_proxy ||
      process.env.all_proxy
  );
}

function getProxyDispatcher(): EnvHttpProxyAgent | undefined {
  if (!hasProxyEnv()) {
    return undefined;
  }

  if (!proxyDispatcher) {
    proxyDispatcher = new EnvHttpProxyAgent();
  }

  return proxyDispatcher;
}

export async function searchDuckDuckGo(input: { query: string; limit: number; timeoutMs: number }): Promise<SearchResult[]> {
  const url = new URL(DUCKDUCKGO_LITE_URL);
  url.searchParams.set("q", input.query);

  const dispatcher = getProxyDispatcher();
  const response = await undiciFetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7"
    },
    signal: withTimeout(input.timeoutMs),
    ...(dispatcher ? { dispatcher } : {})
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${response.status} ${errorText}`);
  }

  const html = await response.text();
  return parseDuckDuckGoHtml(html, input.limit);
}
