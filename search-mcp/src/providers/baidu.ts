import { getBaiduWebSearchConfig, withTimeout } from "../config.js";
import type { SearchResult } from "../types.js";

type BaiduReference = {
  title?: string;
  url?: string;
  content?: string;
};

type BaiduSearchResponse = {
  code?: number;
  message?: string;
  references?: BaiduReference[];
};

export type BaiduSearchRequestBody = {
  messages: Array<{ content: string; role: "user" }>;
  edition: "standard";
  search_source: "baidu_search_v2";
  resource_type_filter: Array<{ type: "web"; top_k: number }>;
  search_filter: Record<string, never>;
  block_websites: undefined;
  search_recency_filter: "year";
  safe_search: false;
};

export function createBaiduRequestBody(query: string, maxResults: number): BaiduSearchRequestBody {
  return {
    messages: [{ content: query, role: "user" }],
    edition: "standard",
    search_source: "baidu_search_v2",
    resource_type_filter: [{ type: "web", top_k: maxResults }],
    search_filter: {},
    block_websites: undefined,
    search_recency_filter: "year",
    safe_search: false
  };
}

export function normalizeBaiduResults(payload: BaiduSearchResponse): SearchResult[] {
  return (payload.references ?? [])
    .filter((item): item is Required<Pick<BaiduReference, "title" | "url">> & BaiduReference => {
      return Boolean(item.title?.trim() && item.url?.trim());
    })
    .map((item) => ({
      title: item.title!.trim(),
      url: item.url!.trim(),
      snippet: item.content?.trim() ?? "",
      provider: "baidu" as const
    }));
}

export async function searchBaidu(input: { query: string; limit: number; timeoutMs: number }): Promise<SearchResult[]> {
  const config = getBaiduWebSearchConfig();
  const response = await fetch(config.baseURL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "X-Appbuilder-From": "z-mcp"
    },
    body: JSON.stringify(createBaiduRequestBody(input.query, input.limit)),
    signal: withTimeout(input.timeoutMs)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as BaiduSearchResponse;
  if (typeof payload.code === "number") {
    throw new Error(payload.message ?? `API error code ${payload.code}`);
  }

  return normalizeBaiduResults(payload);
}
