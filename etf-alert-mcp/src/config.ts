import type { EnvMap, ServerConfig } from "./types.js";

// trimTrailingSlash 规范化 base URL，避免拼接后端路径时出现重复斜杠。
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

// loadConfig 从环境变量读取 MCP Server 运行配置，缺失 API Key 时直接失败。
export function loadConfig(env: EnvMap = process.env): ServerConfig {
  const backendBaseURL = trimTrailingSlash(env.ETF_ALERT_MCP_BACKEND_BASE_URL?.trim() || "http://localhost:8082");
  const apiKey = env.ETF_ALERT_MCP_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ETF_ALERT_MCP_API_KEY is required");
  }
  return { backendBaseURL, apiKey };
}
