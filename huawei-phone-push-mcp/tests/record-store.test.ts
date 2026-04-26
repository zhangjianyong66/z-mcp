import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RecordStore } from "../src/record-store.js";

test("RecordStore saves and paginates records", async () => {
  const dir = await mkdtemp(join(tmpdir(), "huawei-phone-push-mcp-"));
  const store = new RecordStore({
    enabled: true,
    limit: 3,
    dir,
    file: "records.json"
  });

  await store.save({
    requestId: "1",
    createdAt: "2026-01-01T00:00:00.000Z",
    endpoint: "https://example.com",
    traceId: "t1",
    taskName: "a",
    success: true,
    code: "ok",
    message: "ok",
    durationMs: 10
  });
  await store.save({
    requestId: "2",
    createdAt: "2026-01-01T00:00:01.000Z",
    endpoint: "https://example.com",
    traceId: "t2",
    taskName: "b",
    success: true,
    code: "ok",
    message: "ok",
    durationMs: 10
  });
  await store.save({
    requestId: "3",
    createdAt: "2026-01-01T00:00:02.000Z",
    endpoint: "https://example.com",
    traceId: "t3",
    taskName: "c",
    success: true,
    code: "ok",
    message: "ok",
    durationMs: 10
  });
  await store.save({
    requestId: "4",
    createdAt: "2026-01-01T00:00:03.000Z",
    endpoint: "https://example.com",
    traceId: "t4",
    taskName: "d",
    success: false,
    code: "http_error",
    message: "boom",
    durationMs: 10
  });

  const page1 = await store.list(1, 2);
  assert.equal(page1.total, 3);
  assert.equal(page1.items.length, 2);
  assert.equal(page1.items[0]?.requestId, "4");
  assert.equal(page1.items[1]?.requestId, "3");

  const page2 = await store.list(2, 2);
  assert.equal(page2.items.length, 1);
  assert.equal(page2.items[0]?.requestId, "2");
});
