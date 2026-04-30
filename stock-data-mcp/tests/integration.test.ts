import test from "node:test";
import assert from "node:assert/strict";
import {
  runEtfAnalyze,
  runEtfBatchAnalyze,
  runEtfBatchKline,
  runEtfBatchQuote,
  runEtfKline,
  runEtfQuote,
  runSectorList
} from "../src/stock-data.js";

const INTEGRATION_TIMEOUT_MS = 120_000;

function assertHasNumericFields(obj: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    assert.ok(
      field in obj,
      `expected response to have field "${field}"`
    );
    const value = obj[field];
    assert.ok(
      typeof value === "number" || value === null,
      `expected field "${field}" to be a number or null, got ${typeof value}`
    );
  }
}

test("etf_quote fetches real data from xueqiu", { timeout: INTEGRATION_TIMEOUT_MS }, async () => {
  const response = await runEtfQuote({ symbol: "510300", timeout: 30 });

  console.log("etf_quote response:", JSON.stringify(response, null, 2));

  assert.equal(response.source, "xueqiu");
  assert.equal(response.symbol, "510300");
  assert.equal(response.normalizedSymbol, "SH510300");
  assert.ok(response.data, "expected quote data");
  assertHasNumericFields(response.data as Record<string, unknown>, [
    "price",
    "changePercent",
    "changeAmount",
    "open",
    "high",
    "low",
    "prevClose",
    "volume",
    "amount"
  ]);
});

test("etf_kline fetches real kline data from xueqiu", { timeout: INTEGRATION_TIMEOUT_MS }, async () => {
  const response = await runEtfKline({ symbol: "510300", days: 5, timeout: 30 });

  console.log("etf_kline response:", JSON.stringify(response, null, 2));

  assert.equal(response.source, "xueqiu");
  assert.equal(response.symbol, "510300");
  assert.equal(response.normalizedSymbol, "SH510300");
  assert.equal(response.days, 5);
  assert.ok(response.count > 0, "expected at least one kline point");
  assert.ok(response.data.length > 0, "expected data array to not be empty");

  const first = response.data[0];
  assert.ok(typeof first?.date === "string", "expected date to be a string");
  assertHasNumericFields(first as unknown as Record<string, unknown>, [
    "open",
    "close",
    "high",
    "low",
    "volume"
  ]);
});

test("etf_analyze fetches real data from xueqiu", { timeout: INTEGRATION_TIMEOUT_MS }, async () => {
  const response = await runEtfAnalyze({ symbol: "510300", days: 30, timeout: 60 });

  console.log("etf_analyze response:", JSON.stringify(response, null, 2));

  assert.equal(response.source, "xueqiu");
  assert.equal(response.symbol, "510300");
  assert.equal(response.normalizedSymbol, "SH510300");
  assert.ok(response.quote, "expected quote data");
  assert.ok(response.indicators, "expected indicators");
  assert.ok(response.recentKlines.length > 0, "expected recent klines");

  assertHasNumericFields(response.indicators as unknown as Record<string, unknown>, [
    "current",
    "ma5",
    "ma10",
    "ma20",
    "high30",
    "low30"
  ]);
  assert.ok(
    ["bullish", "bearish", "rangebound", "insufficient_data"].includes(response.indicators.trend),
    "expected valid trend value"
  );

  // Verify kline fields are correctly mapped (not volume/open swapped)
  const recent = response.recentKlines[0];
  assert.ok(recent, "expected at least one recent kline");
  assert.ok(
    (recent.open as number) < 100 && (recent.close as number) < 100 && (recent.high as number) < 100 && (recent.low as number) < 100,
    "expected price fields to be reasonable (< 100), got swapped volume values"
  );
  assert.ok(
    (recent.volume as number) > 1_000_000,
    "expected volume to be a large integer, got swapped price value"
  );
});

test("etf_batch_quote fetches real data for multiple symbols", { timeout: INTEGRATION_TIMEOUT_MS }, async () => {
  const response = await runEtfBatchQuote({ symbols: ["510300", "159930"], timeout: 30 });

  console.log("etf_batch_quote response:", JSON.stringify(response, null, 2));

  assert.equal(response.source, "xueqiu");
  assert.equal(response.total, 2);
  assert.equal(response.successCount, 2);
  assert.equal(response.errorCount, 0);
  assert.equal(response.results.length, 2);

  for (const item of response.results) {
    assertHasNumericFields(item.data as Record<string, unknown>, [
      "price",
      "changePercent",
      "open",
      "high",
      "low",
      "volume"
    ]);
  }
});

test("etf_batch_kline fetches real kline data for multiple symbols", { timeout: INTEGRATION_TIMEOUT_MS }, async () => {
  const response = await runEtfBatchKline({ symbols: ["510300", "159930"], days: 5, timeout: 30 });

  console.log("etf_batch_kline response:", JSON.stringify(response, null, 2));

  assert.equal(response.source, "xueqiu");
  assert.equal(response.total, 2);
  assert.equal(response.successCount, 2);

  for (const item of response.results) {
    assert.equal(item.days, 5);
    assert.ok(item.count > 0, `expected count > 0 for ${item.symbol}`);
    const first = item.data[0];
    assert.ok(typeof first?.date === "string", "expected date to be a string");
    assertHasNumericFields(first as unknown as Record<string, unknown>, ["open", "close", "high", "low", "volume"]);
  }
});

test("etf_batch_analyze fetches real analyze data for multiple symbols", { timeout: INTEGRATION_TIMEOUT_MS }, async () => {
  const response = await runEtfBatchAnalyze({ symbols: ["510300", "159930"], days: 30, timeout: 60 });

  console.log("etf_batch_analyze response:", JSON.stringify(response, null, 2));

  assert.equal(response.source, "xueqiu");
  assert.equal(response.total, 2);
  assert.equal(response.successCount, 2);

  for (const item of response.results) {
    assert.ok(item.quote, `expected quote for ${item.symbol}`);
    assert.ok(item.indicators, `expected indicators for ${item.symbol}`);
    assert.ok(item.recentKlines.length > 0, `expected recent klines for ${item.symbol}`);
    assertHasNumericFields(item.indicators as unknown as Record<string, unknown>, [
      "current", "ma5", "ma10", "ma20", "high30", "low30"
    ]);
    assert.ok(
      ["bullish", "bearish", "rangebound", "insufficient_data"].includes(item.indicators.trend),
      "expected valid trend value"
    );
  }
});

test("sector_list fetches real sector data from akshare", { timeout: INTEGRATION_TIMEOUT_MS }, async () => {
  process.env.AKSHARE_SECTOR_SCRIPT_PATH = "scripts/akshare_sector_summary.py";
  const response = await runSectorList({ timeout: 60 });

  console.log("sector_list response:", JSON.stringify(response, null, 2));

  assert.equal(response.source, "akshare_ths");
  assert.ok(response.total > 0, "expected total to be > 0");
  assert.ok(response.data.length > 0, "expected data array to not be empty");
  assert.equal(response.total, response.data.length);

  const first = response.data[0];
  assert.ok(typeof first?.sectorName === "string", "expected sectorName to be a string");
  assert.ok(
    typeof first?.changePercent === "number" || first?.changePercent === null,
    "expected changePercent to be a number or null"
  );
});
