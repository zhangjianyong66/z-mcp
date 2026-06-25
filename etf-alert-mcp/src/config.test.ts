import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "./config.js";

test("loadConfig reads backend base URL and API key from environment", () => {
  const config = loadConfig({
    ETF_ALERT_MCP_BACKEND_BASE_URL: "http://localhost:8082/",
    ETF_ALERT_MCP_API_KEY: "secret-key",
  });

  assert.equal(config.backendBaseURL, "http://localhost:8082");
  assert.equal(config.apiKey, "secret-key");
});

test("loadConfig rejects missing API key", () => {
  assert.throws(
    () => loadConfig({ ETF_ALERT_MCP_BACKEND_BASE_URL: "http://localhost:8082" }),
    /ETF_ALERT_MCP_API_KEY/,
  );
});
