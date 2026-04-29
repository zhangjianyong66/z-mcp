import fs from "node:fs/promises";
import path from "node:path";
import { createCoverFeature, createLyrics, createMusicTask, pollMusicResult, readTaskId } from "./client.js";
import { resolveConfig } from "./config.js";
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
function pickFirstString(...values) {
    for (const value of values) {
        if (typeof value === "string" && value.trim())
            return value;
    }
    return undefined;
}
function collectStringArray(value) {
    if (typeof value === "string" && value.trim())
        return [value];
    if (!Array.isArray(value))
        return [];
    return value.filter((v) => typeof v === "string" && v.trim().length > 0);
}
function inferExt(format) {
    const normalized = format?.toLowerCase();
    if (normalized === "wav")
        return "wav";
    if (normalized === "flac")
        return "flac";
    return "mp3";
}
function normalizeLyricsText(value) {
    return value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
}
function sanitizeTitle(value) {
    return value.replace(/[\\/:*?"<>|]/g, "_").trim();
}
async function reserveOutputPath(base, ext) {
    const config = resolveConfig();
    await fs.mkdir(config.outputDir, { recursive: true });
    let candidate = path.resolve(config.outputDir, `${base}.${ext}`);
    let seq = 1;
    while (true) {
        try {
            await fs.access(candidate);
            seq += 1;
            candidate = path.resolve(config.outputDir, `${base}_${seq}.${ext}`);
        }
        catch {
            break;
        }
    }
    return candidate;
}
async function saveHexAudios(hexAudios, taskId, format) {
    const stamp = new Date().toISOString().replace(/[.:]/g, "-");
    const ext = inferExt(format);
    const filepaths = [];
    for (let i = 0; i < hexAudios.length; i += 1) {
        const base = `${stamp}_${taskId ?? "no-task"}_${i + 1}`;
        const candidate = await reserveOutputPath(base, ext);
        await fs.writeFile(candidate, Buffer.from(hexAudios[i], "hex"));
        filepaths.push(candidate);
    }
    return filepaths;
}
async function saveLyricsText(songTitle, lyrics, taskId) {
    const stamp = new Date().toISOString().replace(/[.:]/g, "-");
    const title = sanitizeTitle(songTitle) || "untitled";
    const base = `${stamp}_${taskId ?? "no-task"}_${title}_lyrics`;
    const filepath = await reserveOutputPath(base, "txt");
    const content = `Title: ${songTitle || "untitled"}\n\n${normalizeLyricsText(lyrics)}\n`;
    await fs.writeFile(filepath, content, "utf8");
    return filepath;
}
function extractLyrics(raw) {
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
    if (!value)
        throw new Error(`MiniMax lyrics response does not contain lyrics text: ${JSON.stringify(raw)}`);
    return value;
}
function extractAudio(raw) {
    const root = asRecord(raw);
    const data = asRecord(root.data ?? root.output ?? root.result);
    const audios = collectStringArray(data.audios ?? data.audio_list ?? root.audios)
        .concat(collectStringArray(data.audio_urls))
        .concat(collectStringArray(root.audio_urls));
    const hexAudios = collectStringArray(data.audio_hex ?? data.audio_hexes ?? root.audio_hex).concat(collectStringArray(data.audio ?? root.audio));
    const directUrls = collectStringArray(data.audio_url ?? root.audio_url).concat(audios);
    const format = pickFirstString(data.audio_format, data.format, root.audio_format, root.format);
    const status = pickFirstString(data.status, root.status) ?? "success";
    return { hexAudios, audioUrls: directUrls, format, status };
}
export async function generateLyrics(input) {
    const config = resolveConfig();
    const payload = {
        mode: "write_full_song",
        model: input.model ?? config.lyricsModel,
        prompt: input.prompt,
        language: input.language
    };
    const raw = await createLyrics(config, payload);
    return {
        provider: "minimax",
        model: payload.model,
        status: "success",
        lyrics: extractLyrics(raw),
        raw_response: raw
    };
}
export async function generateMusic(input) {
    const config = resolveConfig();
    const payload = {
        model: input.model ?? config.musicModel,
        prompt: input.prompt,
        lyrics: input.lyrics,
        audio_setting: input.audio_setting,
        output_format: input.output_format,
        voice_id: input.voice_id,
        instrumentation: input.instrumentation,
        style: input.style,
        genre: input.genre,
        ...(input.custom ?? {})
    };
    const createResp = await createMusicTask(config, payload);
    const taskId = readTaskId(createResp);
    const shouldWait = input.wait_for_result ?? false;
    if (taskId && !shouldWait) {
        return {
            provider: "minimax",
            model: payload.model,
            status: "submitted",
            task_id: taskId,
            raw_response: createResp
        };
    }
    const finalResp = taskId ? await pollMusicResult(config, taskId) : createResp;
    const audio = extractAudio(finalResp);
    let filepaths;
    if ((input.save_to_file ?? true) && audio.hexAudios.length > 0) {
        filepaths = await saveHexAudios(audio.hexAudios, taskId, audio.format ?? input.output_format);
    }
    return {
        provider: "minimax",
        model: payload.model,
        status: audio.status,
        task_id: taskId,
        audio_file_path: filepaths,
        audio_url: audio.audioUrls.length > 0 ? audio.audioUrls : undefined,
        output_format: audio.format ?? input.output_format,
        raw_response: finalResp
    };
}
export async function createMusicCover(input) {
    const config = resolveConfig();
    let sourceAudio = input.source_audio;
    if (!sourceAudio && input.source_audio_path) {
        const expanded = input.source_audio_path.startsWith("~/")
            ? path.join(process.env.HOME ?? "", input.source_audio_path.slice(2))
            : input.source_audio_path;
        const file = await fs.readFile(expanded);
        sourceAudio = file.toString("base64");
    }
    const preprocessPayload = {
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
        wait_for_result: input.wait_for_result,
        custom: {
            cover_feature_id: coverFeatureId,
            ...(input.custom ?? {})
        }
    });
}
export async function generateSongFromPrompt(input) {
    const lyrics = await generateLyrics({
        prompt: input.prompt,
        model: input.lyrics_model,
        language: input.language
    });
    const music = await generateMusic({
        model: input.music_model,
        lyrics: lyrics.lyrics,
        save_to_file: input.save_to_file,
        ...(input.music_options ?? {})
    });
    let lyricsFilePath;
    if (input.save_to_file ?? true) {
        const rawLyrics = asRecord(lyrics.raw_response);
        const title = pickFirstString(rawLyrics.song_title) ?? "untitled";
        lyricsFilePath = await saveLyricsText(title, lyrics.lyrics, music.task_id);
    }
    return {
        provider: "minimax",
        status: music.status,
        lyrics,
        music,
        lyrics_file_path: lyricsFilePath
    };
}
