import { formatProviderError } from "./config.js";
import { searchAliyun } from "./providers/aliyun.js";
import { searchBaidu } from "./providers/baidu.js";
import { searchDuckDuckGo } from "./providers/ddg.js";
import type {
  NormalizedSearchArgs,
  ProviderMap,
  SearchInput,
  SearchProvider,
  SearchResponse,
  SearchResult
} from "./types.js";

const DEFAULT_LIMIT = 10;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MIN_LIMIT = 1;
const MAX_LIMIT = 20;

export function normalizeSearchArgs(input: SearchInput): NormalizedSearchArgs {
  return {
    query: input.query.trim(),
    provider: input.provider ?? "aliyun",
    limit: Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, input.limit ?? DEFAULT_LIMIT)),
    timeoutMs: Math.max(1, input.timeout ?? DEFAULT_TIMEOUT_SECONDS) * 1000
  };
}

export function buildSearchResponse(
  provider: SearchProvider,
  query: string,
  results: SearchResult[]
): SearchResponse {
  return {
    provider,
    query,
    count: results.length,
    results
  };
}

export function createProviderMap(): ProviderMap {
  return {
    aliyun: searchAliyun,
    baidu: searchBaidu,
    ddg: searchDuckDuckGo
  };
}

export async function runSearch(input: NormalizedSearchArgs, providers: ProviderMap = createProviderMap()): Promise<SearchResult[]> {
  try {
    return await providers[input.provider](input);
  } catch (error) {
    throw formatProviderError(input.provider, error);
  }
}
