import type { ApiResponse, ETFAlertInput, ServerConfig } from "./types.js";

// Fetcher 描述 Node 全局 fetch 的最小接口，便于测试记录请求。
type Fetcher = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

// BackendClientOptions 是 ETFAlertBackendClient 的构造参数。
export interface BackendClientOptions extends ServerConfig {
  fetcher?: Fetcher;
}

// ETFAlertBackendClient 封装 MCP Server 到 Go 后端 MCP API 的 HTTP 调用。
export class ETFAlertBackendClient {
  private readonly backendBaseURL: string;
  private readonly apiKey: string;
  private readonly fetcher: Fetcher;

  // constructor 保存后端地址、API Key 和可替换的 fetch 实现。
  constructor(options: BackendClientOptions) {
    this.backendBaseURL = options.backendBaseURL.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetcher = options.fetcher ?? fetch;
  }

  // list 调用分页接口返回配置用户的 ETF 交易提醒列表。
  async list(page: number, size: number): Promise<unknown> {
    return this.request(`/mcp/etfTradeAlert/page/${page}/${size}`, { method: "POST" });
  }

  // get 调用详情接口读取单条 ETF 交易提醒。
  async get(id: string): Promise<unknown> {
    return this.request(`/mcp/etfTradeAlert/get/${encodeURIComponent(id)}`, { method: "GET" });
  }

  // create 调用新增接口创建 ETF 交易提醒。
  async create(input: ETFAlertInput): Promise<unknown> {
    return this.request("/mcp/etfTradeAlert/add", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  // update 调用更新接口修改 ETF 交易提醒。
  async update(id: string, input: ETFAlertInput): Promise<unknown> {
    return this.request(`/mcp/etfTradeAlert/update/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  // delete 调用删除接口物理删除 ETF 交易提醒。
  async delete(id: string): Promise<unknown> {
    return this.request(`/mcp/etfTradeAlert/del/${encodeURIComponent(id)}`, { method: "POST" });
  }

  // request 统一添加 MCP API Key 请求头，并把后端错误消息转换为 MCP 工具异常。
  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetcher(`${this.backendBaseURL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-MCP-API-Key": this.apiKey,
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!response.ok) {
      throw new Error(`Backend HTTP ${response.status}`);
    }
    const payload = (await response.json()) as ApiResponse<T>;
    if (payload.code !== 200) {
      throw new Error(payload.message || "Backend validation failed");
    }
    return payload.data;
  }
}
