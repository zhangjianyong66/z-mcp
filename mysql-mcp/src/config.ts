import { AppError, type AppConfig, type DatasourceConfig } from "./types.js";

type Env = Record<string, string | undefined>;
type RawDatasource = Record<string, unknown>;

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

function parseJsonArray(env: Env, key: string): unknown[] {
  const raw = required(env, key);
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value) || value.length === 0) {
      throw new AppError("invalid_config", `${key} must be a non-empty JSON array`);
    }
    return value;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("invalid_config", `${key} must be valid JSON`);
  }
}

function stringField(source: RawDatasource, key: string, datasourceLabel: string, requiredField = true): string {
  const raw = source[key];
  if (raw === undefined || raw === null) {
    if (requiredField) {
      throw new AppError("invalid_config", `${datasourceLabel}.${key} is required`);
    }
    return "";
  }
  if (typeof raw !== "string") {
    throw new AppError("invalid_config", `${datasourceLabel}.${key} must be a string`);
  }
  const value = raw.trim();
  if (requiredField && !value) {
    throw new AppError("invalid_config", `${datasourceLabel}.${key} is required`);
  }
  return value;
}

function integerField(source: RawDatasource, key: string, fallback: number, min: number, max: number, datasourceLabel: string): number {
  const raw = source[key];
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AppError("invalid_config", `${datasourceLabel}.${key} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function booleanField(source: RawDatasource, key: string, fallback: boolean, datasourceLabel: string): boolean {
  const raw = source[key];
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  throw new AppError("invalid_config", `${datasourceLabel}.${key} must be a boolean`);
}

function parseDatasource(value: unknown, index: number): DatasourceConfig {
  const datasourceLabel = `MYSQL_DATASOURCES[${index}]`;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("invalid_config", `${datasourceLabel} must be an object`);
  }
  const source = value as RawDatasource;

  return {
    name: stringField(source, "name", datasourceLabel),
    description: stringField(source, "description", datasourceLabel, false),
    host: stringField(source, "host", datasourceLabel),
    port: integerField(source, "port", 3306, 1, 65535, datasourceLabel),
    user: stringField(source, "user", datasourceLabel),
    password: stringField(source, "password", datasourceLabel, false),
    database: stringField(source, "database", datasourceLabel),
    ssl: booleanField(source, "ssl", false, datasourceLabel)
  };
}

function parseDatasources(env: Env): DatasourceConfig[] {
  const datasources = parseJsonArray(env, "MYSQL_DATASOURCES").map(parseDatasource);
  const names = new Set<string>();
  for (const datasource of datasources) {
    if (names.has(datasource.name)) {
      throw new AppError("invalid_config", `Duplicate datasource name: ${datasource.name}`);
    }
    names.add(datasource.name);
  }
  return datasources;
}

export function loadConfigFromEnv(env: Env = process.env): AppConfig {
  return {
    queryTimeoutMs: parseInteger(env, "MYSQL_QUERY_TIMEOUT_MS", 30000, 1, 300000),
    maxRows: parseInteger(env, "MYSQL_MAX_ROWS", 500, 1, 5000),
    datasources: parseDatasources(env)
  };
}
