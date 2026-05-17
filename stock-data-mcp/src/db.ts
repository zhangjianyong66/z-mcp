import mysql from "mysql2/promise";
import type { PoolConnection } from "mysql2/promise";

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
let dbPoolFactory: (config: DbConfig) => mysql.Pool = createMysqlPool;

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

function createMysqlPool(config: DbConfig): mysql.Pool {
  return mysql.createPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 2,
    idleTimeout: 30_000,
    connectTimeout: 10_000,
    decimalNumbers: true,
    timezone: "Z"
  });
}

export function getDbPool(): mysql.Pool {
  if (pool) {
    return pool;
  }

  const config = getDbConfig();
  pool = dbPoolFactory(config);

  return pool;
}

export async function closeDbPool(): Promise<void> {
  if (!pool) {
    return;
  }
  await pool.end();
  pool = null;
}

export function setDbPoolFactoryForTests(factory?: (config: DbConfig) => mysql.Pool): void {
  dbPoolFactory = factory ?? createMysqlPool;
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function isRetryableDbConnectionError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "PROTOCOL_CONNECTION_LOST"
  ) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("read ETIMEDOUT") ||
    message.includes("write ETIMEDOUT") ||
    message.includes("connection is in closed state") ||
    message.includes("Connection lost") ||
    message.includes("PROTOCOL_CONNECTION_LOST")
  );
}

export async function withDbRetry<T>(operation: (pool: mysql.Pool) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await operation(getDbPool());
    } catch (error) {
      if (attempt === 2 || !isRetryableDbConnectionError(error)) {
        throw error;
      }
      await closeDbPool();
    }
  }

  throw new Error("unreachable db retry state");
}

export async function withDbConnection<T>(operation: (conn: PoolConnection) => Promise<T>): Promise<T> {
  return withDbRetry(async (activePool) => {
    const conn = await activePool.getConnection();
    try {
      return await operation(conn);
    } finally {
      conn.release();
    }
  });
}

export async function withDbTransaction<T>(operation: (conn: PoolConnection) => Promise<T>): Promise<T> {
  return withDbConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const result = await operation(conn);
      await conn.commit();
      return result;
    } catch (error) {
      try {
        await conn.rollback();
      } catch {
        // Preserve the original DB failure; stale connections often fail rollback too.
      }
      throw error;
    }
  });
}
