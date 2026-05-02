import test from "node:test";
import assert from "node:assert/strict";

import { resolveVideoConfig } from "../src/config.js";

test("resolveVideoConfig reads env values", () => {
  const config = resolveVideoConfig({
    DASHSCOPE_API_KEY: "test-key",
    DASHSCOPE_BASE_URL: "https://example.com/",
    DASHSCOPE_VIDEO_MODEL: "wan2.2-kf2v-flash",
    VIDEO_MCP_OUTPUT_DIR: "/tmp/video-mcp-out"
  });

  assert.deepEqual(config, {
    apiKey: "test-key",
    baseURL: "https://example.com",
    model: "wan2.2-kf2v-flash",
    outputDir: "/tmp/video-mcp-out"
  });
});

test("resolveVideoConfig requires api key", () => {
  assert.throws(() => resolveVideoConfig({}), /DASHSCOPE_API_KEY or LLM_API_KEY/);
});
