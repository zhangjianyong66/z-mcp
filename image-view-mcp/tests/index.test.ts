import test from "node:test";
import assert from "node:assert/strict";

import { IMAGE_VIEW_TOOL_NAMES, createServer } from "../src/index.js";

test("image-view MCP server exposes only analyze_image", () => {
  assert.deepEqual(IMAGE_VIEW_TOOL_NAMES, ["analyze_image"]);
  assert.equal(createServer().constructor.name, "McpServer");
});
