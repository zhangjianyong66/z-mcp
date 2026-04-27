import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { AppError } from "../src/types.js";

test("loadConfig reads TODO_MCP_DB_FILE", () => {
  const old = process.env.TODO_MCP_DB_FILE;
  process.env.TODO_MCP_DB_FILE = " /tmp/todo.db ";

  const config = loadConfig();
  assert.equal(config.dbFile, "/tmp/todo.db");

  process.env.TODO_MCP_DB_FILE = old;
});

test("loadConfig throws when TODO_MCP_DB_FILE is missing", () => {
  const old = process.env.TODO_MCP_DB_FILE;
  delete process.env.TODO_MCP_DB_FILE;

  assert.throws(
    () => loadConfig(),
    (error: unknown) => error instanceof AppError && error.code === "config_error"
  );

  process.env.TODO_MCP_DB_FILE = old;
});
