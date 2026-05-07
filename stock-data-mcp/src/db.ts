import mysql from "mysql2/promise";

export type DbConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

type DefaultDbConfig = Omit<DbConfig, "password">;

const DEFAULT_DB_CONFIG: DefaultDbConfig = {
  host: "mysql.zhangjianyong.top",
  port: 3306,
  database: "web_projects_hub",
  user: "web_projects_hub_app"
};

let pool: mysql.Pool | null = null;

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getDbConfig(): DbConfig {
  return {
    host: process.env.DB_HOST?.trim() || DEFAULT_DB_CONFIG.host,
    port: parsePort(process.env.DB_PORT?.trim(), DEFAULT_DB_CONFIG.port),
    database: process.env.DB_NAME?.trim() || DEFAULT_DB_CONFIG.database,
    user: process.env.DB_USER?.trim() || DEFAULT_DB_CONFIG.user,
    password: requireEnv("DB_PASS")
  };
}

export function getDbPool(): mysql.Pool {
  if (pool) {
    return pool;
  }

  const config = getDbConfig();
  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true,
    timezone: "Z"
  });

  return pool;
}

export async function closeDbPool(): Promise<void> {
  if (!pool) {
    return;
  }
  await pool.end();
  pool = null;
}
