import test from "node:test";
import assert from "node:assert/strict";
import { extractAliyunResults } from "../src/providers/aliyun.js";

test("extractAliyunResults accepts pages arrays from structured payloads", () => {
  const results = extractAliyunResults({
    pages: [
      {
        title: "Ali Result",
        url: "https://example.com/ali",
        snippet: "Ali snippet"
      },
      {
        title: "Skip Missing URL"
      }
    ]
  });

  assert.deepEqual(results, [
    {
      title: "Ali Result",
      url: "https://example.com/ali",
      snippet: "Ali snippet",
      provider: "aliyun"
    }
  ]);
});
