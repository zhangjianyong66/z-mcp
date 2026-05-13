import mysql, { type Pool, type QueryOptions, type RowDataPacket } from "mysql2/promise";
import type { MysqlClient, MysqlConfig, QueryParams } from "./types.js";

export class MysqlPoolClient implements MysqlClient {
  private readonly pool: Pool;
  private readonly queryTimeoutMs: number;

  constructor(config: MysqlConfig) {
    this.queryTimeoutMs = config.queryTimeoutMs;
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? {} : undefined,
      waitForConnections: true,
      connectionLimit: 5,
      namedPlaceholders: false,
      multipleStatements: false,
      rowsAsArray: false
    });
  }

  async query(sql: string, params: QueryParams = []): Promise<{ rows: unknown[]; fields: Array<{ name: string }> }> {
    const options: QueryOptions = { sql, timeout: this.queryTimeoutMs };
    const [rows, fields] = await this.pool.query<RowDataPacket[]>(options, params);
    return {
      rows: Array.isArray(rows) ? rows : [],
      fields: fields.map((field) => ({ name: field.name }))
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

