import path from "node:path";
import type { MinimaxConfig } from "./types.js";

function env(name: string, fallback?: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${name}`);
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

export function resolveConfig(): MinimaxConfig {
  return {
    apiKey: env("MINIMAX_API_KEY"),
    baseURL: env("MINIMAX_BASE_URL", "https://api.minimaxi.com").replace(/\/+$/, ""),
    musicModel: process.env.MINIMAX_MUSIC_MODEL?.trim() || undefined,
    lyricsModel: process.env.MINIMAX_LYRICS_MODEL?.trim() || undefined,
    outputDir: path.resolve(process.cwd(), env("MINIMAX_OUTPUT_DIR", "outputs/minimax-music")),
    pollIntervalMs: envNumber("MINIMAX_POLL_INTERVAL_MS", 3000),
    pollTimeoutMs: envNumber("MINIMAX_POLL_TIMEOUT_MS", 180000)
  };
}
