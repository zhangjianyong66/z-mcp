import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { generateSongFromPrompt } from "../src/service.js";

test("generateSongFromPrompt writes lyrics file when save_to_file is true", async () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "minimax-music-test-"));

  process.env.MINIMAX_API_KEY = "test-key";
  process.env.MINIMAX_OUTPUT_DIR = tmpDir;
  process.env.MINIMAX_BASE_URL = "https://api.minimaxi.com";

  let musicPostCount = 0;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.endsWith("/v1/lyrics_generation") && method === "POST") {
      return new Response(
        JSON.stringify({
          song_title: "烟雨青瓷梦",
          lyrics: "第一行\\n第二行",
          base_resp: { status_code: 0, status_msg: "success" }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url.endsWith("/v1/music_generation") && method === "POST") {
      musicPostCount += 1;
      return new Response(
        JSON.stringify({
          data: { task_id: "task-1" },
          base_resp: { status_code: 0, status_msg: "success" }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url.includes("/v1/music_generation?task_id=task-1") && method === "GET") {
      return new Response(
        JSON.stringify({
          data: { audio: "414243", status: "success", audio_format: "mp3" },
          base_resp: { status_code: 0, status_msg: "success" }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    throw new Error(`unexpected request: ${method} ${url}`);
  };

  try {
    const result = await generateSongFromPrompt({
      prompt: "test prompt",
      save_to_file: true,
      music_options: { wait_for_result: true }
    });

    assert.equal(musicPostCount, 1);
    assert.equal(result.status, "success");
    assert.ok(result.lyrics_file_path);

    const lyricText = await fs.readFile(result.lyrics_file_path!, "utf8");
    assert.match(lyricText, /^Title: 烟雨青瓷梦\n\n第一行\n第二行\n$/);

    assert.ok(result.music.audio_file_path?.[0]);
    const audioBytes = await fs.readFile(result.music.audio_file_path![0]);
    assert.equal(audioBytes.toString("utf8"), "ABC");
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("generateSongFromPrompt does not write lyrics file when save_to_file is false", async () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "minimax-music-test-"));

  process.env.MINIMAX_API_KEY = "test-key";
  process.env.MINIMAX_OUTPUT_DIR = tmpDir;
  process.env.MINIMAX_BASE_URL = "https://api.minimaxi.com";

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.endsWith("/v1/lyrics_generation") && method === "POST") {
      return new Response(
        JSON.stringify({
          lyrics: "仅测试",
          base_resp: { status_code: 0, status_msg: "success" }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url.endsWith("/v1/music_generation") && method === "POST") {
      return new Response(
        JSON.stringify({
          data: { task_id: "task-2" },
          base_resp: { status_code: 0, status_msg: "success" }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    throw new Error(`unexpected request: ${method} ${url}`);
  };

  try {
    const result = await generateSongFromPrompt({
      prompt: "test prompt",
      save_to_file: false
    });

    assert.equal(result.status, "submitted");
    assert.equal(result.lyrics_file_path, undefined);

    const files = await fs.readdir(tmpDir);
    assert.deepEqual(files, []);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
