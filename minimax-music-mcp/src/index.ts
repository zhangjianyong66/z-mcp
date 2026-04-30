import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { createMusicCover, generateSongFromPrompt } from "./service.js";

function toToolError(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: message }], isError: true };
}

const server = new McpServer({ name: "minimax-music-mcp", version: "0.1.0" });

server.tool(
  "create_music_cover",
  "Create a cover: preprocess source audio then generate music with the returned cover feature id.",
  {
    source_audio: z.string().min(1).optional(),
    source_audio_path: z.string().min(1).optional(),
    source_audio_url: z.string().url().optional(),
    model: z.string().min(1).optional(),
    voice_id: z.string().min(1).optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
    save_to_file: z.boolean().optional()
  },
  async (input) => {
    try {
      const result = await createMusicCover(input);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "generate_song_from_prompt",
  "Generate music directly from prompt via music_generation; vocal/instrumental behavior controlled by with_lyrics.",
  {
    prompt: z.string().min(1),
    output_format: z.enum(["hex", "url"]).optional(),
    with_lyrics: z.boolean().optional(),
    audio_setting: z
      .object({
        aigc_watermark: z.boolean().optional(),
        lyrics_optimizer: z.boolean().optional(),
        is_instrumental: z.boolean().optional()
      })
      .optional()
  },
  async (input) => {
    try {
      const result = await generateSongFromPrompt(input as never);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return toToolError(error);
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
