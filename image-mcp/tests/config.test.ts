import test from "node:test";
import assert from "node:assert/strict";

import { resolveProviderChain } from "../src/config.js";

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
