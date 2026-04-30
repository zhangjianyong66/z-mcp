import test from "node:test";
import assert from "node:assert/strict";
import { createAkshareProvider } from "../src/providers/akshare.js";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("akshare provider maps payload fields", async () => {
  const provider = createAkshareProvider({
    runner: async () => ({
      source: "akshare_ths",
      data: [
        {
          sectorName: "半导体",
          changePercent: 2.6,
          upCount: 35,
          downCount: 8,
          amount: 1234.5,
          netInflow: 88.2,
          leaderStock: "北方华创",
          leaderLatestPrice: 125.3,
          leaderChangePercent: 6.5
        }
      ]
    })
  });

  const result = await provider.listIndustrySummary({
    page: 1,
    pageSize: 20,
    limit: 20,
    sortBy: "hot",
    timeoutMs: 15_000
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.sectorName, "半导体");
  assert.equal(result[0]?.changePercent, 2.6);
  assert.equal(result[0]?.leaderStock, "北方华创");
});

test("akshare provider throws when payload is empty", async () => {
  const provider = createAkshareProvider({
    runner: async () => ({ data: [] })
  });

  await assert.rejects(
    provider.listIndustrySummary({
      page: 1,
      pageSize: 20,
      limit: 20,
      sortBy: "hot",
      timeoutMs: 15_000
    }),
    /empty sector list/
  );
});

test("akshare provider propagates runner error", async () => {
  const provider = createAkshareProvider({
    runner: async () => {
      throw new Error("python execution failed");
    }
  });

  await assert.rejects(
    provider.listIndustrySummary({
      page: 1,
      pageSize: 20,
      limit: 20,
      sortBy: "hot",
      timeoutMs: 15_000
    }),
    /python execution failed/
  );
});

test("akshare provider uses AKSHARE_PYTHON_BIN when set", async () => {
  const dir = await mkdtemp(join(tmpdir(), "akshare-test-"));
  const script = join(dir, "dump.py");
  await writeFile(
    script,
    "import json,sys\nprint(json.dumps({'source':'akshare_ths','data':[{'sectorName':'A','changePercent':1}], 'pythonBin': sys.executable}))\n",
    "utf8"
  );

  const oldBin = process.env.AKSHARE_PYTHON_BIN;
  process.env.AKSHARE_PYTHON_BIN = "python3";
  try {
    const provider = createAkshareProvider({ scriptPath: script });
    const result = await provider.listIndustrySummary({
      page: 1,
      pageSize: 20,
      limit: 20,
      sortBy: "hot",
      timeoutMs: 15_000
    });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.sectorName, "A");
  } finally {
    if (oldBin === undefined) {
      delete process.env.AKSHARE_PYTHON_BIN;
    } else {
      process.env.AKSHARE_PYTHON_BIN = oldBin;
    }
  }
});
