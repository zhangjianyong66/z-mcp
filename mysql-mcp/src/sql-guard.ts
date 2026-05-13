import { AppError, type QueryParams } from "./types.js";

const ALLOWED_START = /^(select|show|describe|desc|explain|with)\b/i;
const FORBIDDEN_WORDS =
  /\b(insert|update|delete|replace|truncate|load|create|alter|drop|rename|grant|revoke|set|begin|commit|rollback|lock|unlock|call)\b/i;

export function assertReadOnlySql(sql: string): void {
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new AppError("query_rejected", "SQL must not be empty");
  }
  if (trimmed.includes(";")) {
    throw new AppError("query_rejected", "Multiple statements are not allowed");
  }
  if (trimmed.includes("--") || trimmed.includes("/*") || trimmed.includes("*/")) {
    throw new AppError("query_rejected", "SQL comments are not allowed");
  }
  if (!ALLOWED_START.test(trimmed)) {
    throw new AppError("query_rejected", "Only read-only SQL statements are allowed");
  }
  if (FORBIDDEN_WORDS.test(trimmed)) {
    throw new AppError("query_rejected", "Only read-only SQL statements are allowed");
  }
}

export function applyLimit(sql: string, limit: number): { sql: string; paramsToAppend: QueryParams } {
  const trimmed = sql.trim();
  const startsWithSelectable = /^(select|with)\b/i.test(trimmed);
  const hasLimit = /\blimit\b/i.test(trimmed);

  if (!startsWithSelectable || hasLimit) {
    return { sql, paramsToAppend: [] };
  }

  return {
    sql: `${sql} LIMIT ?`,
    paramsToAppend: [limit]
  };
}

