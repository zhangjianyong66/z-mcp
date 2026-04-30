import fs from "node:fs/promises";
import path from "node:path";

import { createCoverFeature, createLyrics, createMusicTask, readTaskId } from "./client.js";
import { resolveConfig } from "./config.js";
import type {
  CoverInput,
  InstrumentalFromPromptInput,
  LyricsInput,
  LyricsResult,
  MusicInput,
  MusicResult,
  SongFromPromptInput,
  SongResult
} from "./types.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pickFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function collectStringArray(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function inferExt(format: string | undefined): string {
  const normalized = format?.toLowerCase();
  if (normalized === "wav") return "wav";
  if (normalized === "flac") return "flac";
  return "mp3";
}

function normalizeLyricsText(value: string): string {
  return value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
}

function sanitizeTitle(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim();
}

async function reserveOutputPath(base: string, ext: string): Promise<string> {
  const config = resolveConfig();
  await fs.mkdir(config.outputDir, { recursive: true });
  let candidate = path.resolve(config.outputDir, `${base}.${ext}`);
  let seq = 1;
  while (true) {
    try {
      await fs.access(candidate);
      seq += 1;
      candidate = path.resolve(config.outputDir, `${base}_${seq}.${ext}`);
    } catch {
      break;
    }
  }
  return candidate;
}

async function saveHexAudios(
  hexAudios: string[],
  taskId: string | undefined,
  format: string | undefined,
  songTitle?: string
): Promise<string[]> {
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  const ext = inferExt(format);
  const titlePart = sanitizeTitle(songTitle ?? "") || "untitled";

  const filepaths: string[] = [];
  for (let i = 0; i < hexAudios.length; i += 1) {
    const base = `${stamp}_${taskId ?? "no-task"}_${titlePart}_${i + 1}`;
    const candidate = await reserveOutputPath(base, ext);
    await fs.writeFile(candidate, Buffer.from(hexAudios[i], "hex"));
    filepaths.push(candidate);
  }

  return filepaths;
}

async function saveLyricsText(songTitle: string, lyrics: string, taskId?: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  const title = sanitizeTitle(songTitle) || "untitled";
  const base = `${stamp}_${taskId ?? "no-task"}_${title}_lyrics`;
  const filepath = await reserveOutputPath(base, "txt");
  const content = `Title: ${songTitle || "untitled"}\n\n${normalizeLyricsText(lyrics)}\n`;
  await fs.writeFile(filepath, content, "utf8");
  return filepath;
}

function extractLyrics(raw: unknown): string {
  const root = asRecord(raw);
  const data = asRecord(root.data ?? root.output ?? root.result);
  const candidates = [
    root.lyrics,
    root.text,
    data.lyrics,
    data.text,
    asRecord(data.content).lyrics,
    asRecord(data.content).text,
    asRecord(root.content).lyrics,
    asRecord(root.content).text
  ];
  const value = pickFirstString(...candidates);
  if (!value) throw new Error(`MiniMax lyrics response does not contain lyrics text: ${JSON.stringify(raw)}`);
  return value;
}

function extractAudio(raw: unknown): { hexAudios: string[]; audioUrls: string[]; format?: string; status: string } {
  const root = asRecord(raw);
  const data = asRecord(root.data ?? root.output ?? root.result);
  const audios = collectStringArray(data.audios ?? data.audio_list ?? root.audios)
    .concat(collectStringArray(data.audio_urls))
    .concat(collectStringArray(root.audio_urls));

  const hexAudios = collectStringArray(data.audio_hex ?? data.audio_hexes ?? root.audio_hex).concat(
    collectStringArray(data.audio ?? root.audio)
  );

  const directUrls = collectStringArray(data.audio_url ?? root.audio_url).concat(audios);
  const format = pickFirstString(data.audio_format, data.format, root.audio_format, root.format);
  const status = pickFirstString(data.status, root.status) ?? "success";

  return { hexAudios, audioUrls: directUrls, format, status };
}

export async function generateLyrics(input: LyricsInput): Promise<LyricsResult> {
  const config = resolveConfig();
  const payload: Record<string, unknown> = {
    mode: "write_full_song",
    model: input.model ?? config.lyricsModel,
    prompt: input.prompt,
    language: input.language
  };

  const raw = await createLyrics(config, payload);

  return {
    provider: "minimax",
    model: payload.model as string | undefined,
    status: "success",
    lyrics: extractLyrics(raw),
    raw_response: raw
  };
}

export async function generateMusic(input: MusicInput): Promise<MusicResult> {
  const config = resolveConfig();
  const payload: Record<string, unknown> = {
    model: input.model ?? config.musicModel,
    prompt: input.prompt,
    lyrics: input.lyrics,
    audio_setting: input.audio_setting,
    output_format: input.output_format,
    lyrics_optimizer: input.lyrics_optimizer,
    is_instrumental: input.is_instrumental,
    voice_id: input.voice_id,
    instrumentation: input.instrumentation,
    style: input.style,
    genre: input.genre,
    ...(input.custom ?? {})
  };

  const createResp = await createMusicTask(config, payload);
  const taskId = readTaskId(createResp);
  const finalResp = createResp;
  const audio = extractAudio(finalResp);
  const hasAudio = audio.hexAudios.length > 0 || audio.audioUrls.length > 0;
  const status = hasAudio ? audio.status : "submitted";

  let filepaths: string[] | undefined;
  if ((input.save_to_file ?? true) && audio.hexAudios.length > 0) {
    filepaths = await saveHexAudios(audio.hexAudios, taskId, audio.format ?? input.output_format, input.song_title);
  }

  return {
    provider: "minimax",
    model: payload.model as string | undefined,
    status,
    task_id: taskId,
    audio_file_path: filepaths,
    audio_url: audio.audioUrls.length > 0 ? audio.audioUrls : undefined,
    output_format: audio.format ?? input.output_format,
    raw_response: finalResp
  };
}

export async function createMusicCover(input: CoverInput): Promise<MusicResult> {
  const config = resolveConfig();
  let sourceAudio = input.source_audio;
  if (!sourceAudio && input.source_audio_path) {
    const expanded = input.source_audio_path.startsWith("~/")
      ? path.join(process.env.HOME ?? "", input.source_audio_path.slice(2))
      : input.source_audio_path;
    const file = await fs.readFile(expanded);
    sourceAudio = file.toString("base64");
  }

  const preprocessPayload: Record<string, unknown> = {
    model: "music-cover",
    ...(input.source_audio_url ? { audio_url: input.source_audio_url } : {}),
    ...(sourceAudio ? { audio_base64: sourceAudio } : {}),
    ...(input.custom ?? {})
  };

  const preprocessResp = await createCoverFeature(config, preprocessPayload);
  const preprocessData = asRecord(asRecord(preprocessResp).data ?? asRecord(preprocessResp).output ?? preprocessResp);
  const coverFeatureId = pickFirstString(preprocessData.cover_feature_id, preprocessData.feature_id, asRecord(preprocessResp).cover_feature_id);
  const formattedLyrics = pickFirstString(preprocessData.formatted_lyrics, asRecord(preprocessResp).formatted_lyrics);

  if (!coverFeatureId) {
    throw new Error(`MiniMax preprocess response missing cover_feature_id: ${JSON.stringify(preprocessResp)}`);
  }

  return generateMusic({
    model: "music-cover",
    prompt: "Keep original melody and structure, perform as a cover version with the target voice.",
    voice_id: input.voice_id,
    lyrics: formattedLyrics,
    save_to_file: input.save_to_file,
    custom: {
      cover_feature_id: coverFeatureId,
      ...(input.custom ?? {})
    }
  });
}

export async function generateSongFromPrompt(input: SongFromPromptInput): Promise<SongResult> {
  const lyrics = await generateLyrics({
    prompt: input.prompt
  });

  const rawLyrics = asRecord(lyrics.raw_response);
  const title = pickFirstString(rawLyrics.song_title) ?? "untitled";

  const music = await generateMusic({
    prompt: input.prompt,
    lyrics: lyrics.lyrics,
    song_title: title,
    save_to_file: true,
    output_format: input.output_format,
    audio_setting: input.audio_setting,
    lyrics_optimizer: false,
    is_instrumental: false
  });

  const lyricsFilePath = await saveLyricsText(title, lyrics.lyrics, music.task_id);

  return {
    provider: "minimax",
    status: music.status,
    lyrics,
    music,
    lyrics_file_path: lyricsFilePath
  };
}

export async function generateInstrumentalFromPrompt(input: InstrumentalFromPromptInput): Promise<MusicResult> {
  return generateMusic({
    prompt: input.prompt,
    song_title: input.song_title,
    output_format: input.output_format,
    audio_setting: input.audio_setting,
    is_instrumental: true,
    save_to_file: true
  });
}
