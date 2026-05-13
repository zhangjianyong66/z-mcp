import { applyLimit, assertReadOnlySql } from "./sql-guard.js";
import { AppError, type MysqlClient, type QueryParams } from "./types.js";

interface ServiceOptions {
  defaultDatabase: string;
  maxRows: number;
}

interface QueryInput {
  sql: string;
  params?: QueryParams;
  limit?: number;
}

function firstStringValue(row: unknown): string {
  if (!row || typeof row !== "object") {
    return "";
  }
  const value = Object.values(row as Record<string, unknown>)[0];
  return value === undefined || value === null ? "" : String(value);
}

function requireName(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new AppError("invalid_input", `${label} is required`);
  }
  return normalized;
}

export class MysqlService {
  constructor(
    private readonly client: MysqlClient,
    private readonly options: ServiceOptions
  ) {}

  async query(input: QueryInput): Promise<{ rows: unknown[]; fields: string[]; row_count: number; truncated: boolean }> {
    assertReadOnlySql(input.sql);
    const limit = input.limit ?? this.options.maxRows;
    if (!Number.isInteger(limit) || limit < 1 || limit > this.options.maxRows) {
      throw new AppError("invalid_input", `limit must be between 1 and ${this.options.maxRows}`);
    }

    const limited = applyLimit(input.sql, limit);
    const params = [...(input.params ?? []), ...limited.paramsToAppend];
    const result = await this.client.query(limited.sql, params);
    const rows = result.rows.slice(0, limit);

    return {
      rows,
      fields: result.fields.map((field) => field.name),
      row_count: rows.length,
      truncated: result.rows.length > rows.length
    };
  }

  async listDatabases(): Promise<{ databases: string[] }> {
    const result = await this.client.query("SHOW DATABASES");
    return { databases: result.rows.map(firstStringValue).filter(Boolean) };
  }

  async listTables(input: { database?: string }): Promise<{ database: string; tables: Array<{ name: string; type: string }> }> {
    const database = requireName(input.database ?? this.options.defaultDatabase, "database");
    const result = await this.client.query(
      [
        "SELECT table_name, table_type",
        "FROM information_schema.tables",
        "WHERE table_schema = ?",
        "ORDER BY table_name"
      ].join(" "),
      [database]
    );

    return {
      database,
      tables: result.rows.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          name: String(item.table_name ?? ""),
          type: String(item.table_type ?? "")
        };
      })
    };
  }

  async describeTable(input: { database?: string; table: string }): Promise<{
    database: string;
    table: string;
    columns: Array<{ name: string; data_type: string; nullable: boolean; key: string; default: unknown; extra: string }>;
  }> {
    const database = requireName(input.database ?? this.options.defaultDatabase, "database");
    const table = requireName(input.table, "table");
    const result = await this.client.query(
      [
        "SELECT column_name, data_type, is_nullable, column_key, column_default, extra",
        "FROM information_schema.columns",
        "WHERE table_schema = ? AND table_name = ?",
        "ORDER BY ordinal_position"
      ].join(" "),
      [database, table]
    );

    return {
      database,
      table,
      columns: result.rows.map((row) => {
        const item = row as Record<string, unknown>;
        return {
          name: String(item.column_name ?? ""),
          data_type: String(item.data_type ?? ""),
          nullable: item.is_nullable === "YES",
          key: String(item.column_key ?? ""),
          default: item.column_default ?? null,
          extra: String(item.extra ?? "")
        };
      })
    };
  }
}

