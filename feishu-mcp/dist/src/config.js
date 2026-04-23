const DEFAULT_BASE_URL = "https://open.feishu.cn";
const DEFAULT_TIMEOUT_SECONDS = 30;
const MIN_TIMEOUT_SECONDS = 1;
const MAX_TIMEOUT_SECONDS = 120;
const DEFAULT_PAGE_SIZE = 50;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 100;
function readEnv(name) {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
}
function requireEnv(name) {
    const value = readEnv(name);
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
function normalizeBaseURL(baseURL) {
    return baseURL.replace(/\/+$/, "");
}
export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
export function parseTimeoutMs(seconds) {
    const fallback = Number.parseInt(readEnv("FEISHU_TIMEOUT_SECONDS") ?? "", 10);
    const resolvedSeconds = Number.isFinite(seconds)
        ? seconds
        : Number.isFinite(fallback)
            ? fallback
            : DEFAULT_TIMEOUT_SECONDS;
    return clamp(Math.floor(resolvedSeconds), MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS) * 1000;
}
export function normalizePageInput(pageSize, pageToken) {
    return {
        pageSize: clamp(Math.floor(pageSize ?? DEFAULT_PAGE_SIZE), MIN_PAGE_SIZE, MAX_PAGE_SIZE),
        pageToken: pageToken?.trim() || undefined
    };
}
export function getFeishuConfig() {
    return {
        appId: requireEnv("FEISHU_APP_ID"),
        appSecret: requireEnv("FEISHU_APP_SECRET"),
        baseURL: normalizeBaseURL(readEnv("FEISHU_BASE_URL") ?? DEFAULT_BASE_URL),
        timeoutMs: parseTimeoutMs(undefined)
    };
}
export function getDefaultMemberOpenId() {
    return readEnv("FEISHU_DEFAULT_MEMBER_OPEN_ID");
}
export function getAgentMemberMap() {
    const raw = readEnv("FEISHU_AGENT_MEMBER_MAP");
    if (!raw) {
        return {};
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return {};
        }
        const result = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "string" && value.trim()) {
                result[key.trim()] = value.trim();
            }
        }
        return result;
    }
    catch {
        return {};
    }
}
export function resolveDefaultMemberForAgent(agentId) {
    if (agentId) {
        const map = getAgentMemberMap();
        const mapped = map[agentId.trim()];
        if (mapped) {
            return mapped;
        }
    }
    return getDefaultMemberOpenId();
}
export function getAgentAppMap() {
    const raw = readEnv("FEISHU_AGENT_APP_MAP");
    if (!raw) {
        return {};
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return {};
        }
        const result = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (value && typeof value === "object" && !Array.isArray(value)) {
                const v = value;
                const appId = typeof v.app_id === "string" ? v.app_id.trim() : "";
                const appSecret = typeof v.app_secret === "string" ? v.app_secret.trim() : "";
                if (appId && appSecret) {
                    result[key.trim()] = { appId, appSecret };
                }
            }
        }
        return result;
    }
    catch {
        return {};
    }
}
export function resolveAppConfigForAgent(agentId) {
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
