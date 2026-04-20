import { getFeishuConfig, parseTimeoutMs } from "./config.js";
export class FeishuApiError extends Error {
    status;
    code;
    responseBody;
    constructor(message, status, code, responseBody) {
        super(message);
        this.status = status;
        this.code = code;
        this.responseBody = responseBody;
    }
}
export class FeishuClient {
    appId;
    appSecret;
    baseURL;
    defaultTimeoutMs;
    fetcher;
    cachedToken;
    constructor(options) {
        const config = getFeishuConfigSafe(options);
        this.appId = options?.appId ?? config.appId;
        this.appSecret = options?.appSecret ?? config.appSecret;
        this.baseURL = options?.baseURL ?? config.baseURL;
        this.defaultTimeoutMs = options?.timeoutMs ?? config.timeoutMs;
        this.fetcher = options?.fetcher ?? fetch;
    }
    async createChat(payload, timeoutSeconds) {
        return this.requestWithAuth("POST", "/open-apis/im/v1/chats", payload, timeoutSeconds);
    }
    async renameChat(chatId, payload, timeoutSeconds) {
        return this.requestWithAuth("PATCH", `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}`, payload, timeoutSeconds);
    }
    async deleteChat(chatId, timeoutSeconds) {
        return this.requestWithAuth("DELETE", `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}`, undefined, timeoutSeconds);
    }
    async addMembers(chatId, payload, timeoutSeconds) {
        return this.requestWithAuth("POST", `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}/members`, payload, timeoutSeconds);
    }
    async removeMembers(chatId, payload, timeoutSeconds) {
        return this.requestWithAuth("DELETE", `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}/members`, payload, timeoutSeconds);
    }
    async listChats(params, timeoutSeconds) {
        const query = new URLSearchParams();
        query.set("page_size", String(params.pageSize));
        if (params.pageToken) {
            query.set("page_token", params.pageToken);
        }
        return this.requestWithAuth("GET", `/open-apis/im/v1/chats?${query.toString()}`, undefined, timeoutSeconds);
    }
    async getChat(chatId, timeoutSeconds) {
        return this.requestWithAuth("GET", `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}`, undefined, timeoutSeconds);
    }
    async listMembers(chatId, params, timeoutSeconds) {
        const query = new URLSearchParams();
        query.set("page_size", String(params.pageSize));
        if (params.pageToken) {
            query.set("page_token", params.pageToken);
        }
        return this.requestWithAuth("GET", `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}/members?${query.toString()}`, undefined, timeoutSeconds);
    }
    async requestWithAuth(method, path, body, timeoutSeconds) {
        const token = await this.getTenantAccessToken(timeoutSeconds);
        return this.request(method, path, token, body, timeoutSeconds);
    }
    async getTenantAccessToken(timeoutSeconds) {
        const now = Date.now();
        if (this.cachedToken && this.cachedToken.expiresAtMs - 10_000 > now) {
            return this.cachedToken.value;
        }
        const envelope = await this.requestRaw("POST", "/open-apis/auth/v3/tenant_access_token/internal", undefined, {
            app_id: this.appId,
            app_secret: this.appSecret
        }, timeoutSeconds);
        const token = envelope.tenant_access_token;
        const expiresInSeconds = envelope.expire;
        if (!token || !expiresInSeconds) {
            throw new FeishuApiError("Feishu token response missing tenant_access_token or expire", 200, envelope.code, envelope);
        }
        this.cachedToken = {
            value: token,
            expiresAtMs: Date.now() + Number(expiresInSeconds) * 1000
        };
        return token;
    }
    async request(method, path, token, body, timeoutSeconds) {
        const payload = await this.requestRaw(method, path, token, body, timeoutSeconds);
        return payload;
    }
    async requestRaw(method, path, token, body, timeoutSeconds) {
        const timeoutMs = timeoutSeconds == null ? this.defaultTimeoutMs : parseTimeoutMs(timeoutSeconds);
        const signal = AbortSignal.timeout(timeoutMs);
        const headers = {
            "Content-Type": "application/json"
        };
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        const response = await this.fetcher(`${this.baseURL}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal
        });
        const raw = await response.text();
        let payload;
        try {
            payload = raw ? JSON.parse(raw) : {};
        }
        catch {
            throw new FeishuApiError(`Feishu API returned non-JSON response for ${method} ${path}`, response.status, undefined, raw);
        }
        if (!response.ok) {
            throw new FeishuApiError(`Feishu API HTTP ${response.status} for ${method} ${path}`, response.status, undefined, payload);
        }
        if (!payload || typeof payload !== "object") {
            throw new FeishuApiError(`Feishu API returned invalid payload for ${method} ${path}`, response.status, undefined, payload);
        }
        const envelope = payload;
        if (envelope.code !== 0) {
            throw new FeishuApiError(`Feishu API error for ${method} ${path}: code=${String(envelope.code)} msg=${envelope.msg ?? "unknown"}`, response.status, envelope.code, envelope);
        }
        return envelope;
    }
}
function getFeishuConfigSafe(options) {
    try {
        return getFeishuConfig();
    }
    catch {
        if (options?.appId && options?.appSecret) {
            return {
                appId: options.appId,
                appSecret: options.appSecret,
                baseURL: "https://open.feishu.cn",
                timeoutMs: 30_000
            };
        }
        throw new Error("Missing required environment variable: FEISHU_APP_ID");
    }
}
