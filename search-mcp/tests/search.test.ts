import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchResponse,
  normalizeSearchArgs,
  runSearch
} from "../src/search.js";
import type { SearchProvider, SearchResult } from "../src/types.js";

test("normalizeSearchArgs defaults to aliyun provider and standard limits", () => {
  const normalized = normalizeSearchArgs({ query: "openai" });

  assert.equal(normalized.provider, "aliyun");
  assert.equal(normalized.limit, 10);
  assert.equal(normalized.timeoutMs, 30_000);
});

test("buildSearchResponse keeps provider metadata and count", () => {
  const results: SearchResult[] = [
    {
      title: "Example",
      url: "https://example.com",
      snippet: "Example snippet",
      provider: "ddg"
    }
  ];

  const response = buildSearchResponse("ddg", "example", results);

  assert.deepEqual(response, {
    provider: "ddg",
    query: "example",
    count: 1,
    results
  });
});

test("runSearch dispatches to the selected provider", async () => {
  const calls: SearchProvider[] = [];
  const providers = {
    aliyun: async () => {
      calls.push("aliyun");
      return [];
    },
    baidu: async () => {
      calls.push("baidu");
      return [];
    },
    ddg: async () => {
      calls.push("ddg");
      return [];
    }
  };

  await runSearch(
    {
      query: "typescript",
      provider: "baidu",
      limit: 5,
      timeoutMs: 2_000
    },
    providers
  );

  assert.deepEqual(calls, ["baidu"]);
});
