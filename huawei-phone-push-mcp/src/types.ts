export type ToolCode =
  | "ok"
  | "invalid_input"
  | "config_error"
  | "http_error"
  | "upstream_error"
  | "timeout"
  | "io_error"
  | "internal_error";

export type ToolResponse<T = unknown> = {
  success: boolean;
  code: ToolCode;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
};

export type PushMessage = {
  msgId: string;
  scheduleTaskId: string;
  scheduleTaskName: string;
  summary: string;
  result: string;
  content: string;
  source: string;
  taskFinishTime: number;
};

export type PushTaskInput = {
  msgContent: PushMessage[];
};

export type PushTaskOutput = {
  status: number;
  ok: boolean;
  traceId: string;
  businessCode: string | number;
  businessMessage: string;
  response: unknown;
};

export type PushRecord = {
  requestId: string;
  createdAt: string;
  endpoint: string;
  traceId: string;
  taskName: string;
  msgId?: string;
  scheduleTaskId?: string;
  success: boolean;
  code: ToolCode;
  message: string;
  businessCode?: string | number;
  businessMessage?: string;
  durationMs: number;
  httpStatus?: number;
};

export class AppError extends Error {
  readonly code: ToolCode;
  readonly meta?: Record<string, unknown>;

  constructor(code: ToolCode, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.meta = meta;
  }
}
