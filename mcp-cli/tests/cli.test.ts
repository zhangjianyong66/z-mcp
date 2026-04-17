import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { parseArgs, resolveServerTarget, runCli } from "../src/cli.js";

test("parseArgs supports inspect and list-tools", () => {
  const inspect = parseArgs(["inspect", "image"]);
  assert.equal(inspect.command, "inspect");
  assert.equal(inspect.server.name, "image");

  const listTools = parseArgs(["list-tools", "search", "--mode", "dist"]);
  assert.equal(listTools.command, "list-tools");
  assert.equal(listTools.server.args.at(-1), "dist/index.js");
});

test("parseArgs supports call-tool input json", () => {
  const parsed = parseArgs(["call-tool", "stock-data", "etf_quote", "--input", '{"symbol":"159930"}']);
  assert.equal(parsed.command, "call-tool");
  assert.equal(parsed.toolName, "etf_quote");
  assert.deepEqual(parsed.input, { symbol: "159930" });
});

test("resolveServerTarget allows cwd override for custom servers", () => {
  const target = resolveServerTarget({
    serverName: "custom",
    cwdOverride: "/tmp/custom",
    commandOverride: "node",
    argsOverride: ["server.js"]
  });
  assert.equal(target.cwd, "/tmp/custom");
  assert.equal(target.command, "node");
  assert.deepEqual(target.args, ["server.js"]);
});

test("runCli can connect to a local stdio MCP server", async () => {
  const fixturePath = resolve(process.cwd(), "tests/fixtures/fake-server.ts");

  const output = await runCli({
    command: "list-tools",
    server: {
      name: "fixture",
      command: "node",
      args: ["--import", "tsx", fixturePath],
      cwd: process.cwd()
    }
  });

  const payload = output as { tools?: { tools?: Array<{ name: string }> } };
  assert.equal(payload.tools?.tools?.[0]?.name, "echo");

  const callOutput = await runCli({
    command: "call-tool",
    server: {
      name: "fixture",
      command: "node",
      args: ["--import", "tsx", fixturePath],
      cwd: process.cwd()
    },
    toolName: "echo",
    input: { text: "hello" }
  });
  const callPayload = callOutput as {
    result?: { content?: Array<{ type: string; text?: string }> };
  };
  assert.match(callPayload.result?.content?.[0]?.text ?? "", /echoed/);
});

test("resolveServerTarget defaults to sibling package paths", () => {
  const target = resolveServerTarget({ serverName: "image" });
  assert.equal(target.command, "node");
  assert.match(target.cwd, /image-mcp$/);
  assert.deepEqual(target.args, ["--import", "tsx", "src/index.ts"]);
});
