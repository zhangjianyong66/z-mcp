import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DASHSCOPE_BASE_URL, DEFAULT_MODEL } from "./types.js";
function readEnv(source, ...names) {
    for (const name of names) {
        const value = source[name]?.trim();
        if (value) {
            return value;
        }
    }
    return undefined;
}
function normalizeBaseURL(baseURL) {
    return baseURL.replace(/\/+$/, "");
}
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIR = resolve(MODULE_DIR, "..", "outputs", "video-mcp");
export function resolveVideoConfig(source = process.env) {
    const apiKey = readEnv(source, "DASHSCOPE_API_KEY", "LLM_API_KEY");
    if (!apiKey) {
        throw new Error("Missing required environment variable: DASHSCOPE_API_KEY or LLM_API_KEY");
    }
    return {
        apiKey,
        baseURL: normalizeBaseURL(readEnv(source, "DASHSCOPE_BASE_URL", "LLM_BASE_URL") ?? DEFAULT_DASHSCOPE_BASE_URL),
        model: readEnv(source, "DASHSCOPE_VIDEO_MODEL", "DASHSCOPE_MODEL", "LLM_MODEL") ?? DEFAULT_MODEL,
        outputDir: readEnv(source, "VIDEO_MCP_OUTPUT_DIR") ?? DEFAULT_OUTPUT_DIR
    };
}
