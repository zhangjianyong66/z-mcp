import test from "node:test";
import assert from "node:assert/strict";

import { executeWithFallback } from "../src/executor.js";
import type { ImageProviderConfig, ProviderExecutionError } from "../src/types.js";

const chain: ImageProviderConfig[] = [
  { provider: "dashscope", model: "primary", apiKey: "key-a", baseURL: "https://a.example.com" },
  { provider: "dashscope", model: "secondary", apiKey: "key-b", baseURL: "https://b.example.com" }
];

function retryable(status: string, message = status): ProviderExecutionError {
  return { retryable: true, status, message };
}

test("executeWithFallback returns successful result with attempts", async () => {
  const result = await executeWithFallback({
    chain,
    input: { prompt: "question", images: ["image"] },
    executor: async ({ config }) => ({
      provider: "dashscope",
      model: config.model,
      prompt: "question",
      answer: "ok"
    })
  });

  assert.deepEqual(result.attempts, [{ provider: "dashscope", model: "primary", status: "success" }]);
});

test("executeWithFallback tries next model after retryable failure", async () => {
  let calls = 0;

  const result = await executeWithFallback({
    chain,
    input: { prompt: "question", images: ["image"] },
    executor: async ({ config }) => {
      calls += 1;
      if (config.model === "primary") {
        throw retryable("http_500");
      }
      return {
        provider: "dashscope",
        model: config.model,
        prompt: "question",
        answer: "ok"
      };
    }
  });

  assert.equal(calls, 2);
  assert.deepEqual(result.attempts, [
    { provider: "dashscope", model: "primary", status: "http_500" },
    { provider: "dashscope", model: "secondary", status: "success" }
  ]);
});

test("executeWithFallback summarizes all failed attempts", async () => {
  await assert.rejects(
    () =>
      executeWithFallback({
        chain,
        input: { prompt: "question", images: ["image"] },
        executor: async ({ config }) => {
          throw retryable(config.model === "primary" ? "timeout" : "empty_result");
        }
      }),
    /Image view request failed after 2 attempts: dashscope\/primary \(timeout\); dashscope\/secondary \(empty_result\)/
  );
});
