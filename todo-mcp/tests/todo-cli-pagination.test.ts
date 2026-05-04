import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPage,
  clampSelectionToPage,
  getTotalPages,
  isNextPageKey,
  isPrevPageKey
} from "../scripts/todo-cli.js";

test("getTotalPages handles empty and multi-page datasets", () => {
  assert.equal(getTotalPages(0, 10), 1);
  assert.equal(getTotalPages(1, 10), 1);
  assert.equal(getTotalPages(21, 10), 3);
});

test("clampPage constrains page index into legal range", () => {
  assert.equal(clampPage(-1, 30, 10), 0);
  assert.equal(clampPage(0, 30, 10), 0);
  assert.equal(clampPage(2, 30, 10), 2);
  assert.equal(clampPage(5, 30, 10), 2);
  assert.equal(clampPage(3, 0, 10), 0);
});

test("clampSelectionToPage keeps selection inside current page window", () => {
  assert.equal(clampSelectionToPage(0, 0, 10, 0), 0);

  // page 1 (0-based): valid range is [10, 19]
  assert.equal(clampSelectionToPage(3, 25, 10, 1), 10);
  assert.equal(clampSelectionToPage(12, 25, 10, 1), 12);
  assert.equal(clampSelectionToPage(24, 25, 10, 1), 19);

  // last page with only 5 items: valid range is [20, 24]
  assert.equal(clampSelectionToPage(99, 25, 10, 2), 24);
});

test("page navigation key mapping supports brackets, pgup/pgdn and left/right", () => {
  assert.equal(isPrevPageKey("[", {}), true);
  assert.equal(isPrevPageKey("", { name: "pageup" }), true);
  assert.equal(isPrevPageKey("", { name: "left" }), true);
  assert.equal(isPrevPageKey("", { name: "right" }), false);

  assert.equal(isNextPageKey("]", {}), true);
  assert.equal(isNextPageKey("", { name: "pagedown" }), true);
  assert.equal(isNextPageKey("", { name: "right" }), true);
  assert.equal(isNextPageKey("", { name: "left" }), false);
});
