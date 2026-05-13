import { AppError, type MysqlConfig } from "./types.js";

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new AppError("invalid_config", `${key} is required`);
  }
  return value;
}

function parseInteger(env: Env, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AppError("invalid_config", `${key} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function parseBoolean(env: Env, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new AppError("invalid_config", `${key} must be a boolean`);
}

export function loadConfigFromEnv(env: Env = process.env): MysqlConfig {
  return {
    host: required(env, "MYSQL_HOST"),
    port: parseInteger(env, "MYSQL_PORT", 3306, 1, 65535),
    user: required(env, "MYSQL_USER"),
    password: env.MYSQL_PASSWORD ?? "",
    database: required(env, "MYSQL_DATABASE"),
    ssl: parseBoolean(env, "MYSQL_SSL", false),
    queryTimeoutMs: parseInteger(env, "MYSQL_QUERY_TIMEOUT_MS", 30000, 1, 300000),
    maxRows: parseInteger(env, "MYSQL_MAX_ROWS", 500, 1, 5000)
  };
}
