import test from "node:test";
import assert from "node:assert/strict";

import { resolveConfig } from "../src/config.js";

test("resolveConfig reads required and default values", () => {
  const original = { ...process.env };
  process.env.MINIMAX_API_KEY = "k";
  delete process.env.MINIMAX_BASE_URL;
  delete process.env.MINIMAX_OUTPUT_DIR;

  try {
    const config = resolveConfig();
    assert.equal(config.apiKey, "k");
    assert.equal(config.baseURL, "https://api.minimaxi.com");
    assert.match(config.outputDir, /outputs\/minimax-music$/);
  } finally {
    process.env = original;
  }
});

test("resolveConfig throws when api key is missing", () => {
  const original = { ...process.env };
  delete process.env.MINIMAX_API_KEY;

  try {
    assert.throws(() => resolveConfig(), /MINIMAX_API_KEY/);
  } finally {
    process.env = original;
  }
});
