import test from "node:test";
import assert from "node:assert/strict";
import { compressBatchResult } from "../src/batch-response.js";

test("compressBatchResult removes errors when errorCount is zero", () => {
  const result = {
    source: "xueqiu" as const,
    generatedAt: "2026-01-01T00:00:00.000Z",
    total: 1,
    successCount: 1,
    errorCount: 0,
    results: [
      {
        symbol: "510300",
        normalizedSymbol: "SH510300",
        data: {
          symbol: "510300",
          price: 1,
          changePercent: 0,
          changeAmount: 0,
          open: 1,
          high: 1,
          low: 1,
          prevClose: 1,
          volume: 1,
          amount: 1
        }
      }
    ],
    errors: []
  };

  const compressed = compressBatchResult(result);
  assert.equal("errors" in compressed, false);
  assert.equal(compressed.total, result.total);
  assert.equal(compressed.successCount, result.successCount);
  assert.deepEqual(compressed.results, result.results);
});

test("compressBatchResult keeps errors when errorCount is greater than zero", () => {
  const result = {
    source: "xueqiu" as const,
    generatedAt: "2026-01-01T00:00:00.000Z",
    total: 1,
    successCount: 0,
    errorCount: 1,
    results: [],
    errors: [
      {
        symbol: "bad",
        error: "invalid symbol",
        code: "invalid_input" as const,
        retryable: false
      }
    ]
  };

  const compressed = compressBatchResult(result);
  assert.equal("errors" in compressed, true);
  assert.deepEqual(compressed.errors, result.errors);
});
