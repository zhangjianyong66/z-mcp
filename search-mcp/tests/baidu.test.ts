import test from "node:test";
import assert from "node:assert/strict";
import { createBaiduRequestBody, normalizeBaiduResults } from "../src/providers/baidu.js";

test("createBaiduRequestBody uses query and requested top_k", () => {
  const body = createBaiduRequestBody("mcp server", 8);

  assert.equal(body.messages[0]?.content, "mcp server");
  assert.equal(body.resource_type_filter[0]?.top_k, 8);
  assert.equal(body.search_source, "baidu_search_v2");
});

test("normalizeBaiduResults filters incomplete references", () => {
  const results = normalizeBaiduResults({
    references: [
      {
        title: "Good",
        url: "https://example.com",
        content: "Snippet"
      },
      {
        title: "Missing URL",
        content: "Skip"
      }
    ]
  });

  assert.deepEqual(results, [
    {
      title: "Good",
      url: "https://example.com",
      snippet: "Snippet",
      provider: "baidu"
    }
  ]);
});
