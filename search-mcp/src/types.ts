export type SearchProvider = "aliyun" | "baidu" | "ddg";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  provider: SearchProvider;
};

export type SearchInput = {
  query: string;
  provider?: SearchProvider;
  limit?: number;
  timeout?: number;
};

export type NormalizedSearchArgs = {
  query: string;
  provider: SearchProvider;
  limit: number;
  timeoutMs: number;
};

export type SearchResponse = {
  provider: SearchProvider;
  query: string;
  count: number;
  results: SearchResult[];
};

export type ProviderSearchFn = (input: NormalizedSearchArgs) => Promise<SearchResult[]>;

export type ProviderMap = Record<SearchProvider, ProviderSearchFn>;

export type FinanceHotnewsType = "direct" | "search";

export type FinanceHotnewsItem = {
  title: string;
  url: string;
  snippet: string;
  source: string;
  type: FinanceHotnewsType;
};

export type HotSector = {
  name: string;
  score: number;
};

export type PartialFailure = {
  source: string;
  message: string;
};

export type FinanceHotnewsInput = {
  limit?: number;
  timeout?: number;
  include_sectors?: boolean;
  search_fallback?: boolean;
};

export type NormalizedFinanceHotnewsArgs = {
  limit: number;
  timeoutMs: number;
  includeSectors: boolean;
  searchFallback: boolean;
};

export type FinanceHotnewsResponse = {
  generatedAt: string;
  count: number;
  news: FinanceHotnewsItem[];
  sourceStats: {
    direct: number;
    search: number;
  };
  hotSectors?: HotSector[];
  partialFailures?: PartialFailure[];
  queryMode: "fixed-hotnews";
};
