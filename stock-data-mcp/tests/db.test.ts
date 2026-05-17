import test from "node:test";
import assert from "node:assert/strict";
import type mysql from "mysql2/promise";
import { closeDbPool, setDbPoolFactoryForTests, withDbRetry } from "../src/db.js";

const originalDbPass = process.env.DB_PASS;

test.afterEach(async () => {
  await closeDbPool();
  setDbPoolFactoryForTests();
  if (originalDbPass === undefined) {
    delete process.env.DB_PASS;
  } else {
    process.env.DB_PASS = originalDbPass;
  }
});

test("withDbRetry rebuilds the pool once after a stale connection timeout", async () => {
  process.env.DB_PASS ??= "test";
  const endedPools: string[] = [];
  const pools = [
    {
      name: "stale",
      end: async () => {
        endedPools.push("stale");
      }
    },
    {
      name: "fresh",
      end: async () => {
        endedPools.push("fresh");
      }
    }
  ] as unknown as mysql.Pool[];
  let createCount = 0;
  let attempts = 0;

  setDbPoolFactoryForTests(() => pools[createCount++]);

  const result = await withDbRetry(async (pool) => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error("read ETIMEDOUT") as NodeJS.ErrnoException;
      error.code = "ETIMEDOUT";
      throw error;
    }
    return (pool as unknown as { name: string }).name;
  });

  assert.equal(result, "fresh");
  assert.equal(attempts, 2);
  assert.equal(createCount, 2);
  assert.deepEqual(endedPools, ["stale"]);
});
