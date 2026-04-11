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
