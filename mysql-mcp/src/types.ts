export type AppErrorCode =
  | "invalid_config"
  | "invalid_input"
  | "query_rejected"
  | "database_error"
  | "internal_error";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export interface MysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
  queryTimeoutMs: number;
  maxRows: number;
}

export interface QueryField {
  name: string;
}

export type QueryParams = Array<string | number | boolean | null>;

export interface MysqlClient {
  query(sql: string, params?: QueryParams): Promise<{ rows: unknown[]; fields: QueryField[] }>;
  close(): Promise<void>;
}

export interface ToolResult<T> {
  code: 0;
  data: T;
  request_meta: {
    tool: string;
    generated_at: string;
  };
}
