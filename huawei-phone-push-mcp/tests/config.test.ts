import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(patch)) {
    prev[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("loadConfig uses defaults", () => {
  const config = withEnv(
    {
      HUAWEI_PUSH_AUTH_CODE: "secret",
      HUAWEI_PUSH_URL: undefined,
      HUAWEI_PUSH_TIMEOUT_SEC: undefined,
      HUAWEI_PUSH_SAVE_RECORDS: undefined,
      HUAWEI_PUSH_RECORDS_LIMIT: undefined,
      HUAWEI_PUSH_RECORDS_DIR: undefined,
      HUAWEI_PUSH_RECORDS_FILE: undefined
    },
    () => loadConfig()
  );

  assert.equal(
    config.pushUrl,
    "https://hiboard-claw-drcn.ai.dbankcloud.cn/distribution/message/cloud/claw/msg/upload"
  );
  assert.equal(config.timeoutSec, 15);
  assert.equal(config.saveRecords, true);
  assert.equal(config.recordsLimit, 100);
  assert.equal(config.recordsFile, "push-records.json");
});

test("loadConfig requires HUAWEI_PUSH_AUTH_CODE", () => {
  assert.throws(
    () =>
      withEnv(
        {
          HUAWEI_PUSH_AUTH_CODE: undefined
        },
        () => loadConfig()
      ),
    /HUAWEI_PUSH_AUTH_CODE is required/
  );
});

test("loadConfig supports explicit HUAWEI_PUSH_URL override", () => {
  const config = withEnv(
    {
      HUAWEI_PUSH_AUTH_CODE: "secret",
      HUAWEI_PUSH_URL: "https://example.com/push"
    },
    () => loadConfig()
  );
  assert.equal(config.pushUrl, "https://example.com/push");
});
