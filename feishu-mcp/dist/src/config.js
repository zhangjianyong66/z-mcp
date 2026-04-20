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
