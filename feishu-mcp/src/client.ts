import { getFeishuConfig, parseTimeoutMs } from "./config.js";
import type {
  FeishuCreateChatPayload,
  FeishuEnvelope,
  FeishuGetChatData,
  FeishuListChatsData,
  FeishuListMembersData,
  FeishuMembersPayload,
  FeishuUpdateChatPayload
} from "./types.js";

export class FeishuApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: number,
    readonly responseBody?: unknown
  ) {
    super(message);
  }
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type FeishuTenantTokenResponse = {
  code: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
};

export class FeishuClient {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly baseURL: string;
  private readonly defaultTimeoutMs: number;
  private readonly fetcher: FetchLike;

  private cachedToken?: {
    value: string;
    expiresAtMs: number;
  };

  constructor(options?: {
    appId?: string;
    appSecret?: string;
    baseURL?: string;
    timeoutMs?: number;
    fetcher?: FetchLike;
  }) {
    const config = getFeishuConfigSafe(options);
    this.appId = options?.appId ?? config.appId;
    this.appSecret = options?.appSecret ?? config.appSecret;
    this.baseURL = options?.baseURL ?? config.baseURL;
    this.defaultTimeoutMs = options?.timeoutMs ?? config.timeoutMs;
    this.fetcher = options?.fetcher ?? fetch;
  }

  async createChat(payload: FeishuCreateChatPayload, timeoutSeconds?: number): Promise<FeishuEnvelope<FeishuGetChatData>> {
    return this.requestWithAuth<FeishuGetChatData>("POST", "/open-apis/im/v1/chats", payload, timeoutSeconds);
  }

  async renameChat(chatId: string, payload: FeishuUpdateChatPayload, timeoutSeconds?: number): Promise<FeishuEnvelope<FeishuGetChatData>> {
    return this.requestWithAuth<FeishuGetChatData>("PATCH", `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}`, payload, timeoutSeconds);
  }

  async deleteChat(chatId: string, timeoutSeconds?: number): Promise<FeishuEnvelope<Record<string, never>>> {
    return this.requestWithAuth<Record<string, never>>("DELETE", `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}`, undefined, timeoutSeconds);
  }

  async addMembers(chatId: string, payload: FeishuMembersPayload, timeoutSeconds?: number): Promise<FeishuEnvelope<Record<string, never>>> {
    return this.requestWithAuth<Record<string, never>>("POST", `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}/members`, payload, timeoutSeconds);
  }

  async removeMembers(chatId: string, payload: FeishuMembersPayload, timeoutSeconds?: number): Promise<FeishuEnvelope<Record<string, never>>> {
    return this.requestWithAuth<Record<string, never>>("DELETE", `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}/members`, payload, timeoutSeconds);
  }

  async listChats(params: { pageSize: number; pageToken?: string }, timeoutSeconds?: number): Promise<FeishuEnvelope<FeishuListChatsData>> {
    const query = new URLSearchParams();
    query.set("page_size", String(params.pageSize));
    if (params.pageToken) {
      query.set("page_token", params.pageToken);
    }
    return this.requestWithAuth<FeishuListChatsData>("GET", `/open-apis/im/v1/chats?${query.toString()}`, undefined, timeoutSeconds);
  }

  async getChat(chatId: string, timeoutSeconds?: number): Promise<FeishuEnvelope<FeishuGetChatData>> {
    return this.requestWithAuth<FeishuGetChatData>("GET", `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}`, undefined, timeoutSeconds);
  }

  async listMembers(chatId: string, params: { pageSize: number; pageToken?: string }, timeoutSeconds?: number): Promise<FeishuEnvelope<FeishuListMembersData>> {
    const query = new URLSearchParams();
    query.set("page_size", String(params.pageSize));
    if (params.pageToken) {
      query.set("page_token", params.pageToken);
    }
    return this.requestWithAuth<FeishuListMembersData>(
      "GET",
      `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}/members?${query.toString()}`,
      undefined,
      timeoutSeconds
    );
  }

  private async requestWithAuth<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    timeoutSeconds?: number
  ): Promise<FeishuEnvelope<T>> {
    const token = await this.getTenantAccessToken(timeoutSeconds);
    return this.request<T>(method, path, token, body, timeoutSeconds);
  }

  private async getTenantAccessToken(timeoutSeconds?: number): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAtMs - 10_000 > now) {
      return this.cachedToken.value;
    }

    const envelope = await this.requestRaw<FeishuTenantTokenResponse>(
      "POST",
      "/open-apis/auth/v3/tenant_access_token/internal",
      undefined,
      {
        app_id: this.appId,
        app_secret: this.appSecret
      },
      timeoutSeconds
    );

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

  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    token?: string,
    body?: unknown,
    timeoutSeconds?: number
  ): Promise<FeishuEnvelope<T>> {
    const payload = await this.requestRaw<FeishuEnvelope<T>>(method, path, token, body, timeoutSeconds);
    return payload;
  }

  private async requestRaw<T extends { code: number; msg?: string }>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    token?: string,
    body?: unknown,
    timeoutSeconds?: number
  ): Promise<T> {
    const timeoutMs = timeoutSeconds == null ? this.defaultTimeoutMs : parseTimeoutMs(timeoutSeconds);
    const signal = AbortSignal.timeout(timeoutMs);

    const headers: Record<string, string> = {
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
    let payload: unknown;

    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      throw new FeishuApiError(`Feishu API returned non-JSON response for ${method} ${path}`, response.status, undefined, raw);
    }

    if (!response.ok) {
      throw new FeishuApiError(`Feishu API HTTP ${response.status} for ${method} ${path}`, response.status, undefined, payload);
    }

    if (!payload || typeof payload !== "object") {
      throw new FeishuApiError(`Feishu API returned invalid payload for ${method} ${path}`, response.status, undefined, payload);
    }

    const envelope = payload as T;
    if (envelope.code !== 0) {
      throw new FeishuApiError(
        `Feishu API error for ${method} ${path}: code=${String(envelope.code)} msg=${envelope.msg ?? "unknown"}`,
        response.status,
        envelope.code,
        envelope
      );
    }

    return envelope;
  }
}

function getFeishuConfigSafe(options?: { appId?: string; appSecret?: string }): {
  appId: string;
  appSecret: string;
  baseURL: string;
  timeoutMs: number;
} {
  try {
    return getFeishuConfig();
  } catch {
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
