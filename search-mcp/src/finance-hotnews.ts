import { createProviderMap } from "./search.js";
import { withTimeout } from "./config.js";
import type {
  FinanceHotnewsInput,
  FinanceHotnewsItem,
  FinanceHotnewsResponse,
  HotSector,
  NormalizedFinanceHotnewsArgs,
  PartialFailure,
  ProviderMap,
  SearchProvider,
  SearchResult
} from "./types.js";

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 30;
const MIN_LIMIT = 1;
const DEFAULT_TIMEOUT_SECONDS = 30;
const DIRECT_SOURCE_TIMEOUT_MS = 12_000;
const SEARCH_QUERY_SET = ["A股今日热点", "今日财经新闻", "热门板块"] as const;
const SEARCH_PROVIDER_ORDER: SearchProvider[] = ["aliyun", "baidu", "ddg"];

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
} as const;

const SECTOR_KEYWORDS = {
  光伏: ["光伏", "太阳能", "硅料"],
  新能源: ["新能源", "绿电", "清洁能源"],
  锂电池: ["锂电池", "锂矿", "宁德时代"],
  半导体: ["半导体", "芯片", "集成电路"],
  AI: ["人工智能", "AI", "GPT", "大模型"],
  白酒: ["白酒", "茅台", "五粮液"],
  消费: ["消费", "零售"],
  医药: ["医药", "医疗", "创新药"],
  银行: ["银行"],
  券商: ["券商", "证券"],
  房地产: ["房地产", "地产", "楼市"],
  基建: ["基建", "建筑"],
  军工: ["军工", "国防"],
  黄金: ["黄金", "贵金属"],
  有色: ["有色", "铜", "铝", "稀土"],
  煤炭: ["煤炭"],
  石油: ["石油", "原油", "油价"],
  新能源车: ["新能源车", "电动车", "比亚迪"],
  机器人: ["机器人", "智能制造"],
  港股: ["港股", "恒生"],
  美股: ["美股", "纳斯达克"]
} as const;

type DirectSource = {
  name: string;
  fetch: (timeoutMs: number) => Promise<FinanceHotnewsItem[]>;
};

export type FinanceHotnewsDependencies = {
  directSources?: DirectSource[];
  providers?: ProviderMap;
  now?: () => Date;
};

type DirectNewsItem = {
  title: string;
  url: string;
  snippet: string;
  source: string;
  type: "direct";
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/#.*$/, "").replace(/\/+$/, "");
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, "").trim().toLowerCase();
}

function countKeywordMatches(text: string, keyword: string): number {
  return text.split(keyword).length - 1;
}

async function fetchHtml(url: string, timeoutMs: number): Promise<string> {
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: withTimeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.text();
}

export function parseSinaFinanceHtml(html: string): FinanceHotnewsItem[] {
  const newsList: FinanceHotnewsItem[] = [];
  const seenTitles = new Set<string>();
  const patterns = [
    /<a[^>]*href="(https?:\/\/finance\.sina\.com\.cn\/[^"]+)"[^>]*>([^<]{10,120})<\/a>/gi,
    /<a[^>]*href="(https?:\/\/stock\.finance\.sina\.com\.cn\/[^"]+)"[^>]*>([^<]{10,120})<\/a>/gi
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const url = normalizeUrl(match[1] ?? "");
      const title = stripTags(match[2] ?? "");
      if (!url || !title || title.length < 10) {
        continue;
      }

      const normalizedTitle = normalizeTitle(title);
      if (seenTitles.has(normalizedTitle)) {
        continue;
      }

      seenTitles.add(normalizedTitle);
      newsList.push({
        title,
        snippet: "",
        url,
        source: "新浪财经",
        type: "direct"
      });
    }
  }

  return newsList.slice(0, 15);
}

export function parse10jqkaHtml(html: string): FinanceHotnewsItem[] {
  const newsList: FinanceHotnewsItem[] = [];
  const seenTitles = new Set<string>();
  const pattern = /<a[^>]*href="([^"]+)"[^>]*title="([^"]+)"[^>]*>[^<]*<\/a>/gi;

  for (const match of html.matchAll(pattern)) {
    const rawUrl = (match[1] ?? "").trim();
    const title = stripTags(match[2] ?? "");
    const url = rawUrl.startsWith("http") ? normalizeUrl(rawUrl) : normalizeUrl(new URL(rawUrl, "https://www.10jqka.com.cn").toString());
    if (!url || !title || title.length < 10 || title.length >= 100) {
      continue;
    }

    const normalizedTitle = normalizeTitle(title);
    if (seenTitles.has(normalizedTitle)) {
      continue;
    }

    seenTitles.add(normalizedTitle);
    newsList.push({
      title,
      snippet: "",
      url,
      source: "同花顺",
      type: "direct"
    });
  }

  return newsList.slice(0, 10);
}

async function fetchSinaFinance(timeoutMs: number): Promise<FinanceHotnewsItem[]> {
  return parseSinaFinanceHtml(await fetchHtml("https://finance.sina.com.cn/stock/", timeoutMs));
}

async function fetch10jqkaHot(timeoutMs: number): Promise<FinanceHotnewsItem[]> {
  return parse10jqkaHtml(await fetchHtml("https://www.10jqka.com.cn/", timeoutMs));
}

function getDefaultDirectSources(): DirectSource[] {
  return [
    { name: "新浪财经", fetch: fetchSinaFinance },
    { name: "同花顺", fetch: fetch10jqkaHot }
  ];
}

function toSearchNewsItems(results: SearchResult[], provider: SearchProvider): FinanceHotnewsItem[] {
  return results.map((item) => ({
    title: item.title,
    url: normalizeUrl(item.url),
    snippet: item.snippet,
    source: provider,
    type: "search"
  }));
}

export function normalizeFinanceHotnewsArgs(input: FinanceHotnewsInput = {}): NormalizedFinanceHotnewsArgs {
  return {
    limit: Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, input.limit ?? DEFAULT_LIMIT)),
    timeoutMs: Math.max(1, input.timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
    includeSectors: input.include_sectors ?? true,
    searchFallback: input.search_fallback ?? true
  };
}

export function dedupeFinanceHotnews(items: FinanceHotnewsItem[]): FinanceHotnewsItem[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const deduped: FinanceHotnewsItem[] = [];

  for (const item of items) {
    const url = normalizeUrl(item.url);
    const title = normalizeTitle(item.title);
    if (!url || !title) {
      continue;
    }

    if (seenUrls.has(url) || seenTitles.has(title)) {
      continue;
    }

    seenUrls.add(url);
    seenTitles.add(title);
    deduped.push({
      ...item,
      url
    });
  }

  return deduped;
}

export function extractHotSectors(items: FinanceHotnewsItem[]): HotSector[] {
  const text = items.map((item) => `${item.title} ${item.snippet}`).join(" ");
  const sectors: HotSector[] = [];

  for (const [name, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    const score = keywords.reduce((total, keyword) => total + countKeywordMatches(text, keyword), 0);
    if (score > 0) {
      sectors.push({ name, score });
    }
  }

  return sectors.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "zh-CN"));
}

async function collectDirectNews(
  directSources: DirectSource[],
  timeoutMs: number
): Promise<{ items: FinanceHotnewsItem[]; partialFailures: PartialFailure[] }> {
  const perSourceTimeout = Math.max(1, Math.min(DIRECT_SOURCE_TIMEOUT_MS, timeoutMs));
  const settled = await Promise.allSettled(directSources.map((source) => source.fetch(perSourceTimeout)));
  const items: FinanceHotnewsItem[] = [];
  const partialFailures: PartialFailure[] = [];

  settled.forEach((result, index) => {
    const source = directSources[index];
    if (result.status === "fulfilled") {
      items.push(...result.value);
      return;
    }

    partialFailures.push({
      source: source.name,
      message: toErrorMessage(result.reason)
    });
  });

  return { items, partialFailures };
}

async function collectSearchFallback(
  currentItems: FinanceHotnewsItem[],
  limit: number,
  timeoutMs: number,
  providers: ProviderMap
): Promise<{ items: FinanceHotnewsItem[]; partialFailures: PartialFailure[] }> {
  const items: FinanceHotnewsItem[] = [];
  const partialFailures: PartialFailure[] = [];
  const perSearchTimeout = Math.max(1, Math.min(10_000, timeoutMs));

  for (const query of SEARCH_QUERY_SET) {
    if (dedupeFinanceHotnews([...currentItems, ...items]).length >= limit) {
      break;
    }

    for (const provider of SEARCH_PROVIDER_ORDER) {
      if (dedupeFinanceHotnews([...currentItems, ...items]).length >= limit) {
        break;
      }

      try {
        const results = await providers[provider]({
          query,
          provider,
          limit,
          timeoutMs: perSearchTimeout
        });
        items.push(...toSearchNewsItems(results, provider));
      } catch (error) {
        partialFailures.push({
          source: provider,
          message: toErrorMessage(error)
        });
      }
    }
  }

  return { items, partialFailures };
}

export function buildFinanceHotnewsResponse(
  input: NormalizedFinanceHotnewsArgs,
  news: FinanceHotnewsItem[],
  partialFailures: PartialFailure[],
  generatedAt: string
): FinanceHotnewsResponse {
  const response: FinanceHotnewsResponse = {
    generatedAt,
    count: news.length,
    news,
    sourceStats: {
      direct: news.filter((item) => item.type === "direct").length,
      search: news.filter((item) => item.type === "search").length
    },
    queryMode: "fixed-hotnews"
  };

  if (input.includeSectors) {
    response.hotSectors = extractHotSectors(news);
  }

  if (partialFailures.length > 0) {
    response.partialFailures = partialFailures;
  }

  return response;
}

export async function runFinanceHotnews(
  input: NormalizedFinanceHotnewsArgs,
  dependencies: FinanceHotnewsDependencies = {}
): Promise<FinanceHotnewsResponse> {
  const directSources = dependencies.directSources ?? getDefaultDirectSources();
  const providers = dependencies.providers ?? createProviderMap();
  const now = dependencies.now ?? (() => new Date());

  const directResult = await collectDirectNews(directSources, input.timeoutMs);
  let allItems = dedupeFinanceHotnews(directResult.items);
  const partialFailures = [...directResult.partialFailures];

  if (input.searchFallback && allItems.length < input.limit) {
    const fallbackResult = await collectSearchFallback(allItems, input.limit, input.timeoutMs, providers);
    allItems = dedupeFinanceHotnews([...allItems, ...fallbackResult.items]);
    partialFailures.push(...fallbackResult.partialFailures);
  }

  const news = allItems.slice(0, input.limit);
  if (news.length === 0) {
    const reason =
      partialFailures.length > 0
        ? partialFailures.map((item) => `${item.source}: ${item.message}`).join("; ")
        : "no finance hotnews sources returned results";
    throw new Error(`finance_hotnews failed: ${reason}`);
  }

  return buildFinanceHotnewsResponse(input, news, partialFailures, now().toISOString());
}
