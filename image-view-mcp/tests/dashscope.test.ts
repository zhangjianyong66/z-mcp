import test from "node:test";
import assert from "node:assert/strict";

import { analyzeWithDashScope, buildAnalyzeRequestBody } from "../src/providers/dashscope.js";
import type { ImageProviderConfig, ResolvedImage } from "../src/types.js";

const config: ImageProviderConfig = {
  provider: "dashscope",
  model: "qwen3.7-plus",
  apiKey: "api-key",
  baseURL: "https://dashscope.example.com"
};

const resolvedImages: ResolvedImage[] = [{ image: "https://img.example.com/a.png" }];

test("buildAnalyzeRequestBody sends images before prompt text", () => {
  assert.deepEqual(
    buildAnalyzeRequestBody(config, { prompt: "Describe it.", images: ["ignored"] }, resolvedImages),
    {
      model: "qwen3.7-plus",
      input: {
        messages: [
          {
            role: "user",
            content: [{ image: "https://img.example.com/a.png" }, { text: "Describe it." }]
          }
        ]
      }
    }
  );
});

test("analyzeWithDashScope parses text answer and request id", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), "https://dashscope.example.com/api/v1/services/aigc/multimodal-generation/generation");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer api-key");

    return Response.json({
      request_id: "req-1",
      output: {
        choices: [
          {
            message: {
              content: [{ text: "This image shows a chart." }]
            }
          }
        ]
      }
    });
  });

  const result = await analyzeWithDashScope(config, { prompt: "Describe it.", images: ["ignored"] }, resolvedImages);

  assert.deepEqual(result, {
    provider: "dashscope",
    model: "qwen3.7-plus",
    prompt: "Describe it.",
    answer: "This image shows a chart.",
    requestId: "req-1"
  });
});
