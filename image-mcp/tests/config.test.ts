import test from "node:test";
import assert from "node:assert/strict";

import { resolveProviderChain, resolveVisionProviderChain } from "../src/config.js";

test("resolveProviderChain parses IMAGE_MODEL_CHAIN in priority order", () => {
  const chain = resolveProviderChain({
    IMAGE_MODEL_CHAIN: JSON.stringify([
      {
        provider: "dashscope",
        model: "model-a",
        apiKey: "key-a",
        baseURL: "https://example.com/"
      },
      {
        provider: "dashscope",
        model: "model-b",
        apiKey: "key-b"
      }
    ])
  });

  assert.equal(chain.length, 2);
  assert.deepEqual(chain[0], {
    provider: "dashscope",
    model: "model-a",
    apiKey: "key-a",
    baseURL: "https://example.com"
  });
  assert.deepEqual(chain[1], {
    provider: "dashscope",
    model: "model-b",
    apiKey: "key-b",
    baseURL: "https://dashscope.aliyuncs.com"
  });
});

test("resolveProviderChain falls back to legacy single-model environment variables", () => {
  const chain = resolveProviderChain({
    DASHSCOPE_API_KEY: "legacy-key",
    DASHSCOPE_BASE_URL: "https://legacy.example.com/",
    DASHSCOPE_MODEL: "legacy-model"
  });

  assert.deepEqual(chain, [
    {
      provider: "dashscope",
      model: "legacy-model",
      apiKey: "legacy-key",
      baseURL: "https://legacy.example.com"
    }
  ]);
});

test("resolveProviderChain rejects invalid IMAGE_MODEL_CHAIN payloads", () => {
  assert.throws(
    () => resolveProviderChain({ IMAGE_MODEL_CHAIN: "{\"provider\":\"dashscope\"}" }),
    /IMAGE_MODEL_CHAIN must be a JSON array/
  );

  assert.throws(
    () => resolveProviderChain({ IMAGE_MODEL_CHAIN: "[]" }),
    /IMAGE_MODEL_CHAIN must contain at least one provider config/
  );
});

test("resolveVisionProviderChain parses VISION_MODEL_CHAIN in priority order", () => {
  const chain = resolveVisionProviderChain({
    VISION_MODEL_CHAIN: JSON.stringify([
      {
        provider: "dashscope",
        model: "vision-a",
        apiKey: "vision-key-a",
        baseURL: "https://vision.example.com/"
      },
      {
        provider: "dashscope",
        model: "vision-b",
        apiKey: "vision-key-b"
      }
    ])
  });

  assert.deepEqual(chain, [
    {
      provider: "dashscope",
      model: "vision-a",
      apiKey: "vision-key-a",
      baseURL: "https://vision.example.com"
    },
    {
      provider: "dashscope",
      model: "vision-b",
      apiKey: "vision-key-b",
      baseURL: "https://dashscope.aliyuncs.com"
    }
  ]);
});

test("resolveVisionProviderChain falls back to dedicated single-model env vars", () => {
  const chain = resolveVisionProviderChain({
    VISION_API_KEY: "vision-key",
    VISION_BASE_URL: "https://vision.example.com/",
    VISION_MODEL: "qwen-vl-max"
  });

  assert.deepEqual(chain, [
    {
      provider: "dashscope",
      model: "qwen-vl-max",
      apiKey: "vision-key",
      baseURL: "https://vision.example.com"
    }
  ]);
});

test("resolveVisionProviderChain requires a vision model when no chain is configured", () => {
  assert.throws(
    () =>
      resolveVisionProviderChain({
        VISION_API_KEY: "vision-key"
      }),
    /Missing required environment variable: VISION_MODEL/
  );
});
