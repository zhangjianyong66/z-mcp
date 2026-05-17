import { withTimeout } from "./config.js";
import { normalizeFinanceHotnewsArgs, runFinanceHotnews } from "./finance-hotnews.js";
import { createProviderMap, runSearch } from "./search.js";
import type {
  ChineseHotTrendsInput,
  ChineseHotTrendsResponse,
  FinanceHotnewsResponse,
  HotMiningPipelineInput,
  HotMiningPipelineResponse,
  HotTrend,
  HotTrendItem,
  HotTrendSource,
  NormalizedChineseHotTrendsArgs,
  NormalizedHotMiningPipelineArgs,
  PartialFailure,
  ProviderMap,
  SearchResult
} from "./types.js";

const DEFAULT_TREND_SOURCES: HotTrendSource[] = ["baidu", "zhihu", "bilibili"];
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MIN_LIMIT = 1;
const DEFAULT_TIMEOUT_SECONDS = 30;
const DIRECT_SOURCE_TIMEOUT_MS = 12_000;
const VERIFY_PROVIDER = "aliyun" as const;
const LONG_TAIL_QUERY = "GitHub Trending 中文 开源 热门 技术趋势";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
} as const;

type TrendDirectSource = {
  source: HotTrendSource;
  fetch: (timeoutMs: number) => Promise<HotTrendItem[]>;
};

export type ChineseHotTrendsDependencies = {
  sources?: TrendDirectSource[];
  providers?: ProviderMap;
  now?: () => Date;
};

export type HotMiningPipelineDependencies = {
  trends?: (input: NormalizedChineseHotTrendsArgs) => Promise<ChineseHotTrendsResponse>;
  financeHotnews?: () => Promise<FinanceHotnewsResponse>;
  search?: (query: string, limit: number, timeoutMs: number) => Promise<SearchResult[]>;
  now?: () => Date;
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntity(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, "").trim().toLowerCase();
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/[,，\s]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return decodeHtmlEntity(stripTags(value.trim()));
    }
  }

  return "";
}

function readNestedString(record: Record<string, unknown>, path: string[]): string {
  let current: unknown = record;
  for (const key of path) {
    const currentRecord = asRecord(current);
    if (!currentRecord) {
      return "";
    }
    current = currentRecord[key];
  }

  return typeof current === "string" ? decodeHtmlEntity(stripTags(current.trim())) : "";
}

function collectArrays(value: unknown, names: string[], output: unknown[][] = []): unknown[][] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectArrays(item, names, output);
    }
    return output;
  }

  const record = asRecord(value);
  if (!record) {
    return output;
  }

  for (const [key, child] of Object.entries(record)) {
    if (Array.isArray(child) && names.some((name) => key.toLowerCase().includes(name.toLowerCase()))) {
      output.push(child);
    } else if (child && typeof child === "object") {
      collectArrays(child, names, output);
    }
  }

  return output;
}

function extractScriptJson(html: string, id: string): unknown[] {
  const results: unknown[] = [];
  const pattern = new RegExp(`<script[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`, "gi");

  for (const match of html.matchAll(pattern)) {
    const text = decodeHtmlEntity((match[1] ?? "").trim());
    try {
      results.push(JSON.parse(text));
    } catch {
      continue;
    }
  }

  return results;
}

function extractWindowInitialState(html: string): unknown[] {
  const match = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*(?:\(|<\/script>)/i);
  if (!match?.[1]) {
    return [];
  }

  try {
    return [JSON.parse(match[1])];
  } catch {
    return [];
  }
}

function extractSDataPayloads(html: string): unknown[] {
  const results: unknown[] = [];
  const pattern = /<!--s-data:([\s\S]*?)-->/gi;

  for (const match of html.matchAll(pattern)) {
    const text = decodeHtmlEntity((match[1] ?? "").trim());
    try {
      results.push(JSON.parse(text));
    } catch {
      continue;
    }
  }

  return results;
}

function toTrendItem(
  raw: unknown,
  index: number,
  source: HotTrendSource,
  category: string,
  riskLevel: HotTrendItem["riskLevel"]
): HotTrendItem | undefined {
  const record = asRecord(raw);
  if (!record) {
    return undefined;
  }

  const title = readString(record, ["word", "display_query", "query", "title", "name", "keyword"]);
  if (!title) {
    return undefined;
  }

  const url =
    readString(record, ["url", "rawUrl", "short_link_v2", "arcurl", "uri"]) ||
    (source === "bilibili" && readString(record, ["bvid"])
      ? `https://www.bilibili.com/video/${readString(record, ["bvid"])}`
      : `https://www.zhihu.com/search?q=${encodeURIComponent(title)}`);
  const ownerName = readNestedString(record, ["owner", "name"]);
  const snippet = readString(record, ["desc", "excerpt", "summary"]) || (ownerName ? `UP主：${ownerName}` : "");
  const rank = toNumber(record.rank) ?? index + 1;
  const heat =
    toNumber(record.hotScore) ??
    toNumber(record.score) ??
    toNumber(record.heat) ??
    toNumber(asRecord(record.stat)?.view);

  return {
    title,
    url,
    snippet,
    source,
    rank,
    heat,
    category,
    riskLevel
  };
}

function dedupeHotTrendItems(items: HotTrendItem[]): HotTrend[] {
  const byTitle = new Map<string, HotTrend>();

  for (const item of items) {
    const key = normalizeTitle(item.title);
    if (!key) {
      continue;
    }

    const existing = byTitle.get(key);
    if (existing) {
      if (!existing.sources.includes(item.source)) {
        existing.sources.push(item.source);
      }
      existing.heat = Math.max(existing.heat ?? 0, item.heat ?? 0) || existing.heat;
      continue;
    }

    byTitle.set(key, {
      title: item.title,
      url: item.url,
      snippet: item.snippet,
      rank: item.rank,
      heat: item.heat,
      category: item.category,
      riskLevel: item.riskLevel,
      sources: [item.source]
    });
  }

  return [...byTitle.values()];
}

function interleaveTrendItems(items: HotTrendItem[], sourceOrder: HotTrendSource[]): HotTrendItem[] {
  const groups = new Map<HotTrendSource, HotTrendItem[]>();
  for (const source of sourceOrder) {
    groups.set(source, []);
  }

  for (const item of items) {
    const group = groups.get(item.source);
    if (group) {
      group.push(item);
    }
  }

  for (const group of groups.values()) {
    group.sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER));
  }

  const interleaved: HotTrendItem[] = [];
  let index = 0;
  while (true) {
    let added = false;
    for (const source of sourceOrder) {
      const item = groups.get(source)?.[index];
      if (item) {
        interleaved.push(item);
        added = true;
      }
    }

    if (!added) {
      break;
    }
    index += 1;
  }

  return interleaved;
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

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    signal: withTimeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

export function parseBaiduTopHtml(html: string, maxResults: number): HotTrendItem[] {
  const payloads = [...extractScriptJson(html, "__NEXT_DATA__"), ...extractSDataPayloads(html)];
  const arrays = payloads.flatMap((payload) => collectArrays(payload, ["hotList", "content"]));
  const items = arrays.flatMap((array) =>
    array
      .map((item, index) => toTrendItem(item, index, "baidu", "热点发现", "low"))
      .filter((item): item is HotTrendItem => Boolean(item))
  );

  return items.slice(0, maxResults);
}

export function parseZhihuTopSearchHtml(html: string, maxResults: number): HotTrendItem[] {
  const payloads = extractScriptJson(html, "js-initialData");
  const arrays = payloads.flatMap((payload) => collectArrays(payload, ["topSearchWords", "hotList", "list"]));
  const items = arrays.flatMap((array) =>
    array
      .map((item, index) => toTrendItem(item, index, "zhihu", "观点讨论", "medium"))
      .filter((item): item is HotTrendItem => Boolean(item))
  );

  if (items.length > 0) {
    return items.slice(0, maxResults);
  }

  const domItems: HotTrendItem[] = [];
  const pattern = /<div[^>]*class="[^"]*TopSearchMain-item[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*TopSearchMain-item[^"]*"|<\/body>|<\/html>|$)/gi;
  for (const match of html.matchAll(pattern)) {
    const block = match[1] ?? "";
    const rank = toNumber(stripTags(block.match(/TopSearchMain-index[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? ""));
    const title = decodeHtmlEntity(stripTags(block.match(/TopSearchMain-title[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? ""));
    const snippet = decodeHtmlEntity(stripTags(block.match(/TopSearchMain-subTitle[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? ""));
    if (!title) {
      continue;
    }

    domItems.push({
      title,
      url: `https://www.zhihu.com/search?q=${encodeURIComponent(title)}`,
      snippet,
      source: "zhihu",
      rank: rank ?? domItems.length + 1,
      category: "观点讨论",
      riskLevel: "medium"
    });

    if (domItems.length >= maxResults) {
      break;
    }
  }

  return domItems;
}

export function parseBilibiliPopularHtml(html: string, maxResults: number): HotTrendItem[] {
  const payloads = extractWindowInitialState(html);
  const arrays = payloads.flatMap((payload) => collectArrays(payload, ["item", "list", "ranking"]));
  const items = arrays.flatMap((array) =>
    array
      .map((item, index) => toTrendItem(item, index, "bilibili", "视频热门", "low"))
      .filter((item): item is HotTrendItem => Boolean(item))
  );

  return items.slice(0, maxResults);
}

export function parseBilibiliPopularApiPayload(payload: unknown, maxResults: number): HotTrendItem[] {
  const arrays = collectArrays(payload, ["list", "item", "ranking"]);
  const items = arrays.flatMap((array) =>
    array
      .map((item, index) => toTrendItem(item, index, "bilibili", "视频热门", "low"))
      .filter((item): item is HotTrendItem => Boolean(item))
  );

  return items.slice(0, maxResults);
}

async function fetchBaiduTop(timeoutMs: number): Promise<HotTrendItem[]> {
  return parseBaiduTopHtml(await fetchHtml("https://top.baidu.com/board?tab=realtime", timeoutMs), DEFAULT_LIMIT);
}

async function fetchZhihuTopSearch(timeoutMs: number): Promise<HotTrendItem[]> {
  return parseZhihuTopSearchHtml(await fetchHtml("https://www.zhihu.com/topsearch", timeoutMs), DEFAULT_LIMIT);
}

async function fetchBilibiliPopular(timeoutMs: number): Promise<HotTrendItem[]> {
  const apiPayload = await fetchJson("https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1", timeoutMs);
  const apiItems = parseBilibiliPopularApiPayload(apiPayload, DEFAULT_LIMIT);
  if (apiItems.length > 0) {
    return apiItems;
  }

  return parseBilibiliPopularHtml(await fetchHtml("https://www.bilibili.com/v/popular/all/", timeoutMs), DEFAULT_LIMIT);
}

function getDefaultTrendSources(): TrendDirectSource[] {
  return [
    { source: "baidu", fetch: fetchBaiduTop },
    { source: "zhihu", fetch: fetchZhihuTopSearch },
    { source: "bilibili", fetch: fetchBilibiliPopular }
  ];
}

export function normalizeChineseHotTrendsArgs(input: ChineseHotTrendsInput): NormalizedChineseHotTrendsArgs {
  return {
    sources: input.sources?.length ? input.sources : DEFAULT_TREND_SOURCES,
    limit: Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, input.limit ?? DEFAULT_LIMIT)),
    timeoutMs: Math.max(1, input.timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
    verifyWithSearch: input.verify_with_search ?? false
  };
}

export function normalizeHotMiningPipelineArgs(input: HotMiningPipelineInput): NormalizedHotMiningPipelineArgs {
  return {
    sources: input.sources?.length ? input.sources : DEFAULT_TREND_SOURCES,
    limit: Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, input.limit ?? DEFAULT_LIMIT)),
    timeoutMs: Math.max(1, input.timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
    includeIndustry: input.include_industry ?? true,
    includeLongTail: input.include_long_tail ?? true
  };
}

async function collectTrendItems(
  selectedSources: HotTrendSource[],
  sources: TrendDirectSource[],
  timeoutMs: number
): Promise<{ items: HotTrendItem[]; partialFailures: PartialFailure[] }> {
  const activeSources = sources.filter((source) => selectedSources.includes(source.source));
  const perSourceTimeout = Math.max(1, Math.min(DIRECT_SOURCE_TIMEOUT_MS, timeoutMs));
  const settled = await Promise.allSettled(activeSources.map((source) => source.fetch(perSourceTimeout)));
  const items: HotTrendItem[] = [];
  const partialFailures: PartialFailure[] = [];

  settled.forEach((result, index) => {
    const source = activeSources[index];
    if (result.status === "fulfilled") {
      items.push(...result.value);
      return;
    }

    partialFailures.push({
      source: source.source,
      message: toErrorMessage(result.reason)
    });
  });

  return { items, partialFailures };
}

async function attachVerification(
  trends: HotTrend[],
  timeoutMs: number,
  providers: ProviderMap,
  partialFailures: PartialFailure[]
): Promise<void> {
  const perSearchTimeout = Math.max(1, Math.min(8_000, timeoutMs));

  for (const trend of trends) {
    try {
      trend.verification = await providers[VERIFY_PROVIDER]({
        query: trend.title,
        provider: VERIFY_PROVIDER,
        limit: 3,
        timeoutMs: perSearchTimeout
      });
    } catch (error) {
      partialFailures.push({
        source: `verify:${trend.title}`,
        message: toErrorMessage(error)
      });
    }
  }
}

export async function runChineseHotTrends(
  input: NormalizedChineseHotTrendsArgs,
  dependencies: ChineseHotTrendsDependencies = {}
): Promise<ChineseHotTrendsResponse> {
  const sources = dependencies.sources ?? getDefaultTrendSources();
  const providers = dependencies.providers ?? createProviderMap();
  const now = dependencies.now ?? (() => new Date());

  const collected = await collectTrendItems(input.sources, sources, input.timeoutMs);
  const partialFailures = [...collected.partialFailures];
  const trends = dedupeHotTrendItems(interleaveTrendItems(collected.items, input.sources)).slice(0, input.limit);

  if (input.verifyWithSearch) {
    await attachVerification(trends, input.timeoutMs, providers, partialFailures);
  }

  if (trends.length === 0) {
    const reason =
      partialFailures.length > 0
        ? partialFailures.map((item) => `${item.source}: ${item.message}`).join("; ")
        : "no public hot list sources returned results";
    throw new Error(`chinese_hot_trends failed: ${reason}`);
  }

  const sourceStats: Partial<Record<HotTrendSource, number>> = {};
  for (const trend of trends) {
    const primarySource = trend.sources[0];
    sourceStats[primarySource] = (sourceStats[primarySource] ?? 0) + 1;
  }

  return {
    generatedAt: now().toISOString(),
    count: trends.length,
    trends,
    sourceStats,
    ...(partialFailures.length > 0 ? { partialFailures } : {}),
    queryMode: "public-hot-list"
  };
}

export async function buildHotMiningPipeline(
  input: NormalizedHotMiningPipelineArgs,
  dependencies: HotMiningPipelineDependencies = {}
): Promise<HotMiningPipelineResponse> {
  const now = dependencies.now ?? (() => new Date());
  const partialFailures: PartialFailure[] = [];
  const trends =
    dependencies.trends ??
    ((trendInput: NormalizedChineseHotTrendsArgs) =>
      runChineseHotTrends(trendInput, {
        now
      }));
  const financeHotnews =
    dependencies.financeHotnews ??
    (() =>
      runFinanceHotnews(
        normalizeFinanceHotnewsArgs({
          limit: Math.min(input.limit, 30),
          timeout: Math.ceil(input.timeoutMs / 1000),
          include_sectors: true,
          search_fallback: true
        })
      ));
  const search =
    dependencies.search ??
    ((query: string, limit: number, timeoutMs: number) =>
      runSearch({
        query,
        provider: "ddg",
        limit,
        timeoutMs
      }));

  const discovery = await trends({
    sources: input.sources,
    limit: input.limit,
    timeoutMs: input.timeoutMs,
    verifyWithSearch: true
  });

  let industry: FinanceHotnewsResponse | undefined;
  if (input.includeIndustry) {
    try {
      industry = await financeHotnews();
    } catch (error) {
      partialFailures.push({
        source: "industry",
        message: toErrorMessage(error)
      });
    }
  }

  let longTail: HotMiningPipelineResponse["longTail"];
  if (input.includeLongTail) {
    try {
      const results = await search(LONG_TAIL_QUERY, Math.min(input.limit, 10), Math.min(input.timeoutMs, 10_000));
      longTail = {
        count: results.length,
        results
      };
    } catch (error) {
      partialFailures.push({
        source: "long-tail",
        message: toErrorMessage(error)
      });
    }
  }

  return {
    generatedAt: now().toISOString(),
    discovery,
    ...(industry ? { industry } : {}),
    ...(longTail ? { longTail } : {}),
    ...(partialFailures.length > 0 ? { partialFailures } : {}),
    queryMode: "hot-mining-pipeline"
  };
}
