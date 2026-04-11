import test from "node:test";
import assert from "node:assert/strict";

import { executeWithFallback } from "../src/executor.js";
import type {
  ImageProviderConfig,
  ProviderAttempt,
  ProviderExecutionError,
  ProviderExecutor
} from "../src/types.js";

const chain: ImageProviderConfig[] = [
  {
    provider: "dashscope",
    model: "primary",
    apiKey: "key-1",
    baseURL: "https://example.com"
  },
  {
    provider: "dashscope",
    model: "secondary",
    apiKey: "key-2",
    baseURL: "https://example.com"
  }
];

function createRetryableError(status: ProviderExecutionError["status"], message: string): ProviderExecutionError {
  return {
    retryable: true,
    status,
    message
  };
}

function createNonRetryableError(message: string): ProviderExecutionError {
  return {
    retryable: false,
    status: "invalid_input",
    message
  };
}

test("executeWithFallback returns first successful provider result without extra attempts", async () => {
  const attemptsSeen: ProviderAttempt[] = [];
  const executor: ProviderExecutor<string, { value: string }> = async ({ config, attempts }) => {
    attemptsSeen.push(...attempts);
    return {
      provider: config.provider,
      model: config.model,
      value: "ok"
    };
  };

  const result = await executeWithFallback({
    chain,
    input: "ignored",
    executor
  });

  assert.equal(result.model, "primary");
  assert.equal(result.value, "ok");
  assert.deepEqual(result.attempts, [
    { provider: "dashscope", model: "primary", status: "success" }
  ]);
  assert.deepEqual(attemptsSeen, []);
});

test("executeWithFallback falls back on retryable provider errors and records attempt statuses", async () => {
  const executor: ProviderExecutor<string, { value: string }> = async ({ config }) => {
    if (config.model === "primary") {
      throw createRetryableError("http_500", "upstream failed");
    }

    return {
      provider: config.provider,
      model: config.model,
      value: "recovered"
    };
  };

  const result = await executeWithFallback({
    chain,
    input: "ignored",
    executor
  });

  assert.equal(result.model, "secondary");
  assert.equal(result.value, "recovered");
  assert.deepEqual(result.attempts, [
    { provider: "dashscope", model: "primary", status: "http_500" },
    { provider: "dashscope", model: "secondary", status: "success" }
  ]);
});

test("executeWithFallback stops immediately on non-retryable errors", async () => {
  const executor: ProviderExecutor<string, { value: string }> = async ({ config }) => {
    if (config.model === "primary") {
      throw createNonRetryableError("bad local input");
    }

    return {
      provider: config.provider,
      model: config.model,
      value: "should not happen"
    };
  };

  await assert.rejects(
    () =>
      executeWithFallback({
        chain,
        input: "ignored",
        executor
      }),
    /bad local input/
  );
});

test("executeWithFallback aggregates retryable failures after exhausting the chain", async () => {
  const executor: ProviderExecutor<string, { value: string }> = async ({ config }) => {
    throw createRetryableError(config.model === "primary" ? "timeout" : "empty_result", `failed ${config.model}`);
  };

  await assert.rejects(
    () =>
      executeWithFallback({
        chain,
        input: "ignored",
        executor
      }),
    /Image request failed after 2 attempts: dashscope\/primary \(timeout\); dashscope\/secondary \(empty_result\)/
  );
});
