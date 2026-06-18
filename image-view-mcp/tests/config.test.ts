import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveVisionProviderChain } from "../src/config.js";

function withTempDir(callback: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "image-view-config-test-"));
  try {
    callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("resolveVisionProviderChain parses single model configuration", () => {
  const chain = resolveVisionProviderChain({
    DASHSCOPE_API_KEY: "key",
    DASHSCOPE_BASE_URL: "https://dashscope.example.com/",
    VISION_MODEL: "qwen3.7-plus"
  });

  assert.deepEqual(chain, [
    {
      provider: "dashscope",
      model: "qwen3.7-plus",
      apiKey: "key",
      baseURL: "https://dashscope.example.com"
    }
  ]);
});

test("resolveVisionProviderChain parses fallback chain from inline JSON", () => {
  const chain = resolveVisionProviderChain({
    VISION_MODEL_CHAIN: JSON.stringify([
      {
        provider: "dashscope",
        model: "primary",
        apiKey: "primary-key",
        baseURL: "https://primary.example.com/"
      },
      {
        provider: "dashscope",
        model: "secondary",
        apiKey: "secondary-key"
      }
    ])
  });

  assert.deepEqual(chain, [
    {
      provider: "dashscope",
      model: "primary",
      apiKey: "primary-key",
      baseURL: "https://primary.example.com"
    },
    {
      provider: "dashscope",
      model: "secondary",
      apiKey: "secondary-key",
      baseURL: "https://dashscope.aliyuncs.com"
    }
  ]);
});

test("resolveVisionProviderChain parses fallback chain from file", () => {
  withTempDir((dir) => {
    const chainPath = join(dir, "vision-chain.json");
    writeFileSync(
      chainPath,
      JSON.stringify([{ provider: "dashscope", model: "file-model", apiKey: "file-key" }]),
      "utf8"
    );

    const chain = resolveVisionProviderChain({ VISION_MODEL_CHAIN: `file:${chainPath}` });

    assert.deepEqual(chain, [
      {
        provider: "dashscope",
        model: "file-model",
        apiKey: "file-key",
        baseURL: "https://dashscope.aliyuncs.com"
      }
    ]);
  });
});

test("resolveVisionProviderChain requires VISION_MODEL without chain", () => {
  assert.throws(
    () => resolveVisionProviderChain({ DASHSCOPE_API_KEY: "key" }),
    /Missing required environment variable: VISION_MODEL/
  );
});
