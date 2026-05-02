import test from "node:test";
import assert from "node:assert/strict";

import { generateVideoFromFirstFrame, resolveApiVariant } from "../src/service.js";

test("resolveApiVariant routes kf2v model to legacy", () => {
  assert.equal(resolveApiVariant("wan2.2-kf2v-flash"), "legacy_kf2v");
});

test("resolveApiVariant routes wan2.7 i2v model to modern", () => {
  assert.equal(resolveApiVariant("wan2.7-i2v-2026-04-25"), "modern_i2v");
});

test("resolveApiVariant rejects unsupported model", () => {
  assert.throws(() => resolveApiVariant("wan2.7-t2v"), /Unsupported model/);
});

test("generateVideoFromFirstFrame rejects non-i2v models", async () => {
  const oldApiKey = process.env.DASHSCOPE_API_KEY;
  const oldModel = process.env.DASHSCOPE_VIDEO_MODEL;
  process.env.DASHSCOPE_API_KEY = "test-key";
  process.env.DASHSCOPE_VIDEO_MODEL = "wan2.2-kf2v-flash";
  try {
    await assert.rejects(
      () =>
        generateVideoFromFirstFrame({
          first_frame_url: "https://example.com/first.png",
          model: "wan2.2-kf2v-flash"
        }),
      /only supports wan2.7\/happyhorse i2v/
    );
  } finally {
    if (oldApiKey === undefined) {
      delete process.env.DASHSCOPE_API_KEY;
    } else {
      process.env.DASHSCOPE_API_KEY = oldApiKey;
    }
    if (oldModel === undefined) {
      delete process.env.DASHSCOPE_VIDEO_MODEL;
    } else {
      process.env.DASHSCOPE_VIDEO_MODEL = oldModel;
    }
  }
});
