import test from "node:test";
import assert from "node:assert/strict";

import { clamp, getDefaultMemberOpenId, normalizePageInput, parseTimeoutMs } from "../src/config.js";

test("clamp limits numeric range", () => {
  assert.equal(clamp(0, 1, 10), 1);
  assert.equal(clamp(11, 1, 10), 10);
  assert.equal(clamp(5, 1, 10), 5);
});

test("normalizePageInput applies defaults and trims page token", () => {
  assert.deepEqual(normalizePageInput(undefined, "  abc  "), {
    pageSize: 50,
    pageToken: "abc"
  });

  assert.deepEqual(normalizePageInput(999, ""), {
    pageSize: 100,
    pageToken: undefined
  });
});

test("parseTimeoutMs clamps timeout seconds", () => {
  assert.equal(parseTimeoutMs(0), 1_000);
  assert.equal(parseTimeoutMs(200), 120_000);
  assert.equal(parseTimeoutMs(30), 30_000);
});

test("getDefaultMemberOpenId reads FEISHU_DEFAULT_MEMBER_OPEN_ID", () => {
  const old = process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID;
  process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID = "  ou_default  ";
  assert.equal(getDefaultMemberOpenId(), "ou_default");
  process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID = old;
});
