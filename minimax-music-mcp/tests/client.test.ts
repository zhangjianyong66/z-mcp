import test from "node:test";
import assert from "node:assert/strict";

import { readTaskId } from "../src/client.js";

test("readTaskId extracts from root and nested data", () => {
  assert.equal(readTaskId({ task_id: "a" }), "a");
  assert.equal(readTaskId({ data: { task_id: "b" } }), "b");
  assert.equal(readTaskId({ output: { taskId: "c" } }), "c");
  assert.equal(readTaskId({}), undefined);
});
