import test from "node:test";
import assert from "node:assert/strict";
import { createAkshareProvider } from "../src/providers/akshare.js";

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
