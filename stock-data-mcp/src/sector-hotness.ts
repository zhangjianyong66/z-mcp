import { withTimeout } from "./config.js";
import type { SectorSnapshotItem } from "./types.js";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
} as const;

const NEWS_SOURCES = [
  "https://finance.sina.com.cn/stock/",
  "https://www.10jqka.com.cn/"
] as const;

const SECTOR_KEYWORDS: Record<string, string[]> = {
  光伏: ["光伏", "太阳能", "硅料"],
  新能源: ["新能源", "绿电", "清洁能源"],
  锂电池: ["锂电池", "锂矿", "电池"],
  半导体: ["半导体", "芯片", "集成电路"],
  AI: ["人工智能", "AI", "大模型"],
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
  新能源车: ["新能源车", "电动车", "汽车"],
  机器人: ["机器人", "智能制造"]
};

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, "").trim().toLowerCase();
}

function countKeywordMatches(text: string, keyword: string): number {
  if (!keyword) {
    return 0;
  }
  return text.split(keyword).length - 1;
}

function normalizeNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max <= min) {
    return 0;
  }
  return (value - min) / (max - min);
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

function parseSinaTitles(html: string): string[] {
  const titles: string[] = [];
  const patterns = [
    /<a[^>]*href="https?:\/\/finance\.sina\.com\.cn\/[^\"]+"[^>]*>([^<]{8,120})<\/a>/gi,
    /<a[^>]*href="https?:\/\/stock\.finance\.sina\.com\.cn\/[^\"]+"[^>]*>([^<]{8,120})<\/a>/gi
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const title = stripTags(match[1] ?? "");
      if (title.length >= 8) {
        titles.push(title);
      }
    }
  }

  return titles;
}

function parse10jqkaTitles(html: string): string[] {
  const titles: string[] = [];
  const pattern = /<a[^>]*title="([^\"]{8,120})"[^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    const title = stripTags(match[1] ?? "");
    if (title.length >= 8) {
      titles.push(title);
    }
  }
  return titles;
}

export async function fetchFinanceNewsTitles(timeoutMs: number): Promise<string[]> {
  const perSourceTimeout = Math.max(1, Math.min(timeoutMs, 10_000));
  const settled = await Promise.allSettled(
    NEWS_SOURCES.map(async (source) => {
      const html = await fetchHtml(source, perSourceTimeout);
      return source.includes("sina") ? parseSinaTitles(html) : parse10jqkaTitles(html);
    })
  );

  const seen = new Set<string>();
  const titles: string[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") {
      continue;
    }
    for (const title of result.value) {
      const normalized = normalizeTitle(title);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      titles.push(title);
    }
  }

  return titles.slice(0, 80);
}

function getSectorKeywords(name: string): string[] {
  const explicit = SECTOR_KEYWORDS[name] ?? [];
  return Array.from(new Set([name, ...explicit].filter(Boolean)));
}

export function calculateMarketScores(items: SectorSnapshotItem[]): number[] {
  const changes = items.map((item) => item.changePercent ?? 0);
  const amounts = items.map((item) => item.amount ?? 0);
  const breadths = items.map((item) => {
    const up = item.upCount ?? 0;
    const down = item.downCount ?? 0;
    const total = up + down;
    if (total <= 0) {
      return 0;
    }
    return (up - down) / total;
  });

  const minChange = Math.min(...changes);
  const maxChange = Math.max(...changes);
  const minAmount = Math.min(...amounts);
  const maxAmount = Math.max(...amounts);
  const minBreadth = Math.min(...breadths);
  const maxBreadth = Math.max(...breadths);

  return items.map((_, index) => {
    const changeScore = normalizeNumber(changes[index] ?? 0, minChange, maxChange);
    const amountScore = normalizeNumber(amounts[index] ?? 0, minAmount, maxAmount);
    const breadthScore = normalizeNumber(breadths[index] ?? 0, minBreadth, maxBreadth);
    return Number((0.5 * changeScore + 0.35 * amountScore + 0.15 * breadthScore).toFixed(6));
  });
}

export function calculateNewsScores(items: SectorSnapshotItem[], newsTitles: string[]): number[] {
  const corpus = newsTitles.join(" ");
  const rawScores = items.map((item) => {
    const keywords = getSectorKeywords(item.sectorName);
    return keywords.reduce((total, keyword) => total + countKeywordMatches(corpus, keyword), 0);
  });

  const minScore = Math.min(...rawScores);
  const maxScore = Math.max(...rawScores);

  return rawScores.map((score) => Number(normalizeNumber(score, minScore, maxScore).toFixed(6)));
}
