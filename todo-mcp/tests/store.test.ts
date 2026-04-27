import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { TodoStore } from "../src/store.js";

test("TodoStore initializes sqlite schema", async () => {
  const dir = await mkdtemp(join(tmpdir(), "todo-mcp-store-"));
  const store = new TodoStore(join(dir, "todo.db"));

  const planTable = await store.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='plans'`
  );
  const taskTable = await store.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'`
  );
  const subtaskTable = await store.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='subtasks'`
  );

  assert.equal(planTable?.name, "plans");
  assert.equal(taskTable?.name, "tasks");
  assert.equal(subtaskTable?.name, "subtasks");
});
