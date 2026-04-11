import test from "node:test";
import assert from "node:assert/strict";

import { analyzeWithDashScope, buildAnalyzeRequestBody } from "../src/providers/dashscope.js";
import type { ImageProviderConfig, ResolvedImage } from "../src/types.js";

const config: ImageProviderConfig = {
  provider: "dashscope",
  model: "qwen-vl-max",
  apiKey: "test-key",
  baseURL: "https://example.com"
};

const resolvedImages: ResolvedImage[] = [{ image: "https://img.example.com/a.png" }, { image: "data:image/png;base64,abc" }];

test("buildAnalyzeRequestBody includes ordered images followed by prompt text", () => {
  const body = buildAnalyzeRequestBody(
    config,
    {
      prompt: "Compare the two images.",
      images: ["ignored-a", "ignored-b"]
    },
    resolvedImages
  );

  assert.deepEqual(body, {
    model: "qwen-vl-max",
    input: {
      messages: [
        {
          role: "user",
          content: [{ image: "https://img.example.com/a.png" }, { image: "data:image/png;base64,abc" }, { text: "Compare the two images." }]
        }
      ]
    }
  });
});

test("analyzeWithDashScope returns concatenated text answer", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        request_id: "req-123",
        output: {
          choices: [
            {
              message: {
                content: [{ text: "The first image shows a cat." }, { text: "The second image shows a dog." }]
              }
            }
          ]
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );

  try {
    const result = await analyzeWithDashScope(
      config,
      {
        prompt: "What is in the images?",
        images: ["ignored-a", "ignored-b"]
      },
      resolvedImages
    );

    assert.deepEqual(result, {
      provider: "dashscope",
      model: "qwen-vl-max",
      prompt: "What is in the images?",
      answer: "The first image shows a cat.\n\nThe second image shows a dog.",
      requestId: "req-123"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("analyzeWithDashScope treats missing text output as empty_result", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        output: {
          choices: [
            {
              message: {
                content: [{ image: "https://img.example.com/result.png" }]
              }
            }
          ]
        }
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );

  try {
    await assert.rejects(
      () =>
        analyzeWithDashScope(
          config,
          {
            prompt: "Describe the image.",
            images: ["ignored-a"]
          },
          [resolvedImages[0]]
        ),
      (error: unknown) =>
        Boolean(
          error &&
            typeof error === "object" &&
            "retryable" in error &&
            "status" in error &&
            "message" in error &&
            (error as { retryable?: boolean }).retryable === true &&
            (error as { status?: string }).status === "empty_result"
        )
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
