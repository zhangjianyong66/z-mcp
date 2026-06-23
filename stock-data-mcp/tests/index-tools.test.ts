import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("MCP tool registry does not expose save_trade_orders", async () => {
  const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const toolNames = [...source.matchAll(/server\.tool\(\s*\n\s*"([^"]+)"/g)].map((match) => match[1]);

  assert.ok(!toolNames.includes("save_trade_orders"));
});
