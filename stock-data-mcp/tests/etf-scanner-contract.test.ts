import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CONTRACT_FILES = [
  "skills/etf-scanner/SKILL.md",
  "skills/etf-scanner/README.md",
  "skills/etf-scanner/references/output-contract.md"
];

test("etf-scanner reason mapping includes buy_signal_confirmed in all contract docs", () => {
  for (const file of CONTRACT_FILES) {
    const content = readFileSync(resolve(process.cwd(), file), "utf8");
    assert.match(content, /`buy_signal_confirmed`\s*->\s*`买入信号成立`/, `${file} missing buy_signal_confirmed mapping`);
  }
});

test("etf-scanner reason mapping keeps unknown_reason fallback in all contract docs", () => {
  for (const file of CONTRACT_FILES) {
    const content = readFileSync(resolve(process.cwd(), file), "utf8");
    assert.match(content, /`unknown_reason`\s*->\s*`未知原因（需排查）`/, `${file} missing unknown_reason mapping`);
  }
});

