import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createMusicCover, generateLyrics, generateMusic, generateSongFromPrompt } from "./service.js";
function toToolError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: message }], isError: true };
}
const server = new McpServer({ name: "minimax-music-mcp", version: "0.1.0" });
server.tool("generate_lyrics", "Generate song lyrics from a text prompt via MiniMax lyrics_generation API.", {
    prompt: z.string().min(1),
    model: z.string().min(1).optional(),
    language: z.string().min(1).optional()
}, async (input) => {
    try {
        const result = await generateLyrics(input);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    catch (error) {
        return toToolError(error);
    }
});
server.tool("generate_music", "Generate music from prompt/lyrics via MiniMax music_generation API.", {
    prompt: z.string().min(1).optional(),
    lyrics: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    voice_id: z.string().min(1).optional(),
    instrumentation: z.string().min(1).optional(),
    style: z.string().min(1).optional(),
    genre: z.string().min(1).optional(),
    output_format: z.string().min(1).optional(),
    audio_setting: z.record(z.string(), z.unknown()).optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
    save_to_file: z.boolean().optional(),
    wait_for_result: z.boolean().optional()
}, async (input) => {
    try {
        const result = await generateMusic(input);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    catch (error) {
        return toToolError(error);
    }
});
server.tool("create_music_cover", "Create a cover: preprocess source audio then generate music with the returned cover feature id.", {
    source_audio: z.string().min(1).optional(),
    source_audio_path: z.string().min(1).optional(),
    source_audio_url: z.string().url().optional(),
    model: z.string().min(1).optional(),
    voice_id: z.string().min(1).optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
    save_to_file: z.boolean().optional(),
    wait_for_result: z.boolean().optional()
}, async (input) => {
    try {
        const result = await createMusicCover(input);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    catch (error) {
        return toToolError(error);
    }
});
server.tool("generate_song_from_prompt", "End-to-end workflow: generate lyrics first, then generate music from those lyrics.", {
    prompt: z.string().min(1),
    lyrics_model: z.string().min(1).optional(),
    music_model: z.string().min(1).optional(),
    language: z.string().min(1).optional(),
    save_to_file: z.boolean().optional(),
    music_options: z.record(z.string(), z.unknown()).optional()
}, async (input) => {
    try {
        const result = await generateSongFromPrompt(input);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    catch (error) {
        return toToolError(error);
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
});
