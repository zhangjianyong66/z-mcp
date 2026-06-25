// EnvMap 描述 MCP Server 从进程环境或测试注入对象读取的配置来源。
export type EnvMap = Record<string, string | undefined>;

// ServerConfig 是 MCP Server 调用后端 MCP API 所需的运行时配置。
export interface ServerConfig {
  backendBaseURL: string;
  apiKey: string;
}

// ETFAlertInput 对齐 Go 后端 etfalert.AlertInput 的 JSON 字段。
export interface ETFAlertInput {
  id?: string;
  etfCode: string;
  etfName?: string;
  actionType: string;
  shares: number;
  conditionType: string;
  triggerPrice: number;
  messageTemplate?: string;
  notifyType?: string;
  email?: string;
  enabled?: boolean;
  state?: string;
  cooldownMinutes?: number;
}

// BackendClient 描述工具 handler 需要的后端调用能力，便于测试注入替身。
export interface BackendClient {
  list(page: number, size: number): Promise<unknown>;
  get(id: string): Promise<unknown>;
  create(input: ETFAlertInput): Promise<unknown>;
  update(id: string, input: ETFAlertInput): Promise<unknown>;
  delete(id: string): Promise<unknown>;
}

// ApiResponse 是 Go 后端统一响应结构，code 为 200 时 data 才会返回给 MCP 客户端。
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}
