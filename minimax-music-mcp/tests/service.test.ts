import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { generateInstrumentalFromPrompt, generateSongFromPrompt } from "../src/service.js";

test("generateSongFromPrompt calls lyrics_generation then music_generation and writes lyrics/audio files", async () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "minimax-music-test-"));

  process.env.MINIMAX_API_KEY = "test-key";
  process.env.MINIMAX_OUTPUT_DIR = tmpDir;
  process.env.MINIMAX_BASE_URL = "https://api.minimaxi.com";

  let musicPostCount = 0;
  let lyricsPostCount = 0;
  let lastMusicPayload: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.endsWith("/v1/lyrics_generation") && method === "POST") {
      lyricsPostCount += 1;
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
      lastMusicPayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          data: { task_id: "task-1", audio: "414243", status: "success", audio_format: "mp3" },
          base_resp: { status_code: 0, status_msg: "success" }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    throw new Error(`unexpected request: ${method} ${url}`);
  };

  try {
    const result = await generateSongFromPrompt({
      prompt: "test prompt"
    });

    assert.equal(musicPostCount, 1);
    assert.equal(lyricsPostCount, 1);
    assert.equal(lastMusicPayload?.prompt, "test prompt");
    assert.equal(lastMusicPayload?.lyrics, "第一行\\n第二行");
    assert.equal(lastMusicPayload?.is_instrumental, false);
    assert.equal(result.status, "success");
    assert.ok(result.lyrics_file_path);
    const lyricText = await fs.readFile(result.lyrics_file_path!, "utf8");
    assert.match(lyricText, /^Title: 烟雨青瓷梦\n\n第一行\n第二行\n$/);

    assert.ok(result.music.audio_file_path?.[0]);
    assert.match(path.basename(result.music.audio_file_path![0]), /task-1_烟雨青瓷梦_1\.mp3$/);
    const audioBytes = await fs.readFile(result.music.audio_file_path![0]);
    assert.equal(audioBytes.toString("utf8"), "ABC");
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("generateInstrumentalFromPrompt enforces instrumental generation and caller song title", async () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "minimax-music-test-"));

  process.env.MINIMAX_API_KEY = "test-key";
  process.env.MINIMAX_OUTPUT_DIR = tmpDir;
  process.env.MINIMAX_BASE_URL = "https://api.minimaxi.com";

  let lastMusicPayload: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.endsWith("/v1/music_generation") && method === "POST") {
      lastMusicPayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          data: { task_id: "task-2", audio: "414243", status: "success", audio_format: "mp3" },
          base_resp: { status_code: 0, status_msg: "success" }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    throw new Error(`unexpected request: ${method} ${url}`);
  };

  try {
    const result = await generateInstrumentalFromPrompt({
      prompt: "ambient city night",
      song_title: "City Night"
    });

    assert.equal(lastMusicPayload?.prompt, "ambient city night");
    assert.equal(lastMusicPayload?.is_instrumental, true);
    assert.ok(result.audio_file_path?.[0]);
    assert.match(path.basename(result.audio_file_path![0]), /task-2_City Night_1\.mp3$/);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
