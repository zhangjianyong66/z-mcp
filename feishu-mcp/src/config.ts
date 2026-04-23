const DEFAULT_BASE_URL = "https://open.feishu.cn";
const DEFAULT_TIMEOUT_SECONDS = 30;
const MIN_TIMEOUT_SECONDS = 1;
const MAX_TIMEOUT_SECONDS = 120;
const DEFAULT_PAGE_SIZE = 50;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 100;

export type FeishuConfig = {
  appId: string;
  appSecret: string;
  baseURL: string;
  timeoutMs: number;
};

export type FeishuAppCredentials = {
  appId: string;
  appSecret: string;
};

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.replace(/\/+$/, "");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseTimeoutMs(seconds: number | undefined): number {
  const fallback = Number.parseInt(readEnv("FEISHU_TIMEOUT_SECONDS") ?? "", 10);
  const resolvedSeconds = Number.isFinite(seconds)
    ? seconds!
    : Number.isFinite(fallback)
      ? fallback
      : DEFAULT_TIMEOUT_SECONDS;

  return clamp(Math.floor(resolvedSeconds), MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS) * 1000;
}

export function normalizePageInput(pageSize?: number, pageToken?: string): { pageSize: number; pageToken?: string } {
  return {
    pageSize: clamp(Math.floor(pageSize ?? DEFAULT_PAGE_SIZE), MIN_PAGE_SIZE, MAX_PAGE_SIZE),
    pageToken: pageToken?.trim() || undefined
  };
}

export function getFeishuConfig(): FeishuConfig {
  return {
    appId: requireEnv("FEISHU_APP_ID"),
    appSecret: requireEnv("FEISHU_APP_SECRET"),
    baseURL: normalizeBaseURL(readEnv("FEISHU_BASE_URL") ?? DEFAULT_BASE_URL),
    timeoutMs: parseTimeoutMs(undefined)
  };
}

export function getDefaultMemberOpenId(): string | undefined {
  return readEnv("FEISHU_DEFAULT_MEMBER_OPEN_ID");
}

export function getAgentMemberMap(): Record<string, string> {
  const raw = readEnv("FEISHU_AGENT_MEMBER_MAP");
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) {
        result[key.trim()] = value.trim();
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function resolveDefaultMemberForAgent(agentId?: string): string | undefined {
  if (agentId) {
    const map = getAgentMemberMap();
    const mapped = map[agentId.trim()];
    if (mapped) {
      return mapped;
    }
  }
  return getDefaultMemberOpenId();
}

export function getAgentAppMap(): Record<string, FeishuAppCredentials> {
  const raw = readEnv("FEISHU_AGENT_APP_MAP");
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, FeishuAppCredentials> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const v = value as Record<string, unknown>;
        const appId = typeof v.app_id === "string" ? v.app_id.trim() : "";
        const appSecret = typeof v.app_secret === "string" ? v.app_secret.trim() : "";
        if (appId && appSecret) {
          result[key.trim()] = { appId, appSecret };
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function resolveAppConfigForAgent(agentId?: string): FeishuConfig {
  const baseConfig = getFeishuConfig();
  if (agentId) {
    const map = getAgentAppMap();
    const mapped = map[agentId.trim()];
    if (mapped) {
      return {
        appId: mapped.appId,
        appSecret: mapped.appSecret,
        baseURL: baseConfig.baseURL,
        timeoutMs: baseConfig.timeoutMs
      };
    }
  }
  return baseConfig;
}
