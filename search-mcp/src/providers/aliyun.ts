import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getAliyunWebSearchConfig } from "../config.js";
import type { SearchResult } from "../types.js";

type AliyunPage = {
  title?: string;
  url?: string;
  snippet?: string;
  text?: string;
};

type AliyunPayload = {
  pages?: AliyunPage[];
  results?: AliyunPage[];
  data?: {
    pages?: AliyunPage[];
    results?: AliyunPage[];
  };
};

const ALIYUN_TOOL_NAME = "bailian_web_search";

export function extractAliyunResults(payload: unknown): SearchResult[] {
  const candidate = payload as AliyunPayload;
  const pages = candidate.pages ?? candidate.results ?? candidate.data?.pages ?? candidate.data?.results ?? [];

  return pages
    .filter((item): item is Required<Pick<AliyunPage, "title" | "url">> & AliyunPage => {
      return Boolean(item.title?.trim() && item.url?.trim());
    })
    .map((item) => ({
      title: item.title!.trim(),
      url: item.url!.trim(),
      snippet: item.snippet?.trim() ?? item.text?.trim() ?? "",
      provider: "aliyun" as const
    }));
}

function extractTextContent(result: unknown): string[] {
  if (!result || typeof result !== "object" || !("content" in result) || !Array.isArray(result.content)) {
    return [];
  }

  return result.content
    .filter(
      (item): item is { type: "text"; text: string } =>
        Boolean(item) && typeof item === "object" && "type" in item && item.type === "text" && "text" in item
    )
    .map((item) => item.text)
    .filter(Boolean);
}

export async function searchAliyun(input: { query: string; limit: number; timeoutMs: number }): Promise<SearchResult[]> {
  const config = getAliyunWebSearchConfig();
  const client = new Client({
    name: "search-mcp-aliyun-client",
    version: "0.1.0"
  });
  const transport = new StreamableHTTPClientTransport(new URL(config.baseURL), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${config.apiKey}`
      }
    }
  });

  try {
    await client.connect(transport);
    const result = await client.callTool(
      {
        name: ALIYUN_TOOL_NAME,
        arguments: {
          query: input.query,
          count: input.limit
        }
      },
      undefined,
      {
        timeout: input.timeoutMs
      }
    );

    if (result.structuredContent && typeof result.structuredContent === "object") {
      return extractAliyunResults(result.structuredContent);
    }

    for (const text of extractTextContent(result)) {
      try {
        return extractAliyunResults(JSON.parse(text));
      } catch {
        continue;
      }
    }

    return [];
  } finally {
    await transport.close();
  }
}
