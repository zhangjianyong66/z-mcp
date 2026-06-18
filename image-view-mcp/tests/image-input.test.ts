import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveImageInput } from "../src/image-input.js";

function withTempDir(callback: (dir: string) => Promise<void> | void): Promise<void> | void {
  const dir = mkdtempSync(join(tmpdir(), "image-view-input-test-"));
  try {
    return callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("resolveImageInput accepts data image URLs", async () => {
  const input = "data:image/png;base64,abc";
  assert.deepEqual(await resolveImageInput(input), { image: input });
});

test("resolveImageInput rejects malformed data image URLs", async () => {
  await assert.rejects(() => resolveImageInput("data:image/png,abc"), /Invalid data URL/);
});

test("resolveImageInput converts local image files to data URLs", async () => {
  await withTempDir(async (dir) => {
    const imagePath = join(dir, "sample.png");
    writeFileSync(imagePath, Buffer.from("png-bytes"));

    const resolved = await resolveImageInput(imagePath);

    assert.equal(resolved.image, "data:image/png;base64,cG5nLWJ5dGVz");
  });
});

test("resolveImageInput rejects unsupported local file types", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "sample.txt");
    writeFileSync(filePath, "not an image");

    await assert.rejects(() => resolveImageInput(filePath), /Unsupported local image type/);
  });
});

test("resolveImageInput accepts remote image URLs with image content type", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("image", { headers: { "content-type": "image/png" } }));

  assert.deepEqual(await resolveImageInput("https://example.com/a.png"), { image: "https://example.com/a.png" });
});
