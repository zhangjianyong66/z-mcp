import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEtfInput,
  normalizeEtfKlineInput,
  normalizeSectorListInput,
  normalizeSymbol
} from "../src/symbol.js";

test("normalizeSymbol accepts bare Shenzhen ETF code", () => {
  assert.deepEqual(normalizeSymbol("159930"), {
    code: "159930",
    market: "SZ",
    prefixed: "SZ159930",
    secid: "0.159930"
  });
});

test("normalizeSymbol accepts prefixed Shanghai ETF code", () => {
  assert.deepEqual(normalizeSymbol("SH510300"), {
    code: "510300",
    market: "SH",
    prefixed: "SH510300",
    secid: "1.510300"
  });
});

test("normalizeEtfInput applies default provider and timeout", () => {
  const input = normalizeEtfInput({ symbol: "510300" }, "xueqiu");
  assert.equal(input.provider, "xueqiu");
  assert.equal(input.timeoutMs, 15_000);
  assert.equal(input.normalizedSymbol.prefixed, "SH510300");
});

test("normalizeEtfKlineInput clamps day range", () => {
  const input = normalizeEtfKlineInput({ symbol: "159930", days: 999 }, "xueqiu");
  assert.equal(input.days, 180);
  assert.equal(input.provider, "xueqiu");
});

test("normalizeSectorListInput applies default timeout of 60 seconds", () => {
  const input = normalizeSectorListInput();
  assert.equal(input.sortBy, "hot");
  assert.equal(input.timeoutMs, 60_000);
});
