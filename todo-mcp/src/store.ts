import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import sqlite3 from "sqlite3";
import { open, type Database } from "sqlite";
import { AppError } from "./types.js";

type SqliteValue = string | number | null;

export class TodoStore {
  private readonly dbPromise: Promise<Database>;

  constructor(private readonly dbFile: string) {
    this.dbPromise = this.init();
  }

  async get<T>(sql: string, params: SqliteValue[] = []): Promise<T | undefined> {
    const db = await this.getDb();
    try {
      return await db.get<T>(sql, ...params);
    } catch (error) {
      throw toIoError("query row", error);
    }
  }

  async all<T>(sql: string, params: SqliteValue[] = []): Promise<T[]> {
    const db = await this.getDb();
    try {
      const rows = await db.all<T[]>(sql, ...params);
      return rows;
    } catch (error) {
      throw toIoError("query rows", error);
    }
  }

  async run(sql: string, params: SqliteValue[] = []): Promise<void> {
    const db = await this.getDb();
    try {
      await db.run(sql, ...params);
    } catch (error) {
      throw toIoError("execute statement", error);
    }
  }

  async withTransaction<T>(fn: (db: Database) => Promise<T>): Promise<T> {
    const db = await this.getDb();
    try {
      await db.exec("BEGIN IMMEDIATE TRANSACTION");
      const result = await fn(db);
      await db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        await db.exec("ROLLBACK");
      } catch {
        // ignore rollback errors and surface original
      }
      if (error instanceof AppError) {
        throw error;
      }
      throw toIoError("run transaction", error);
    }
  }

  private async getDb(): Promise<Database> {
    return this.dbPromise;
  }

  private async init(): Promise<Database> {
    try {
      await mkdir(dirname(this.dbFile), { recursive: true });
      const db = await open({
        filename: this.dbFile,
        driver: sqlite3.Database
      });
      await db.exec("PRAGMA foreign_keys = ON;");
      await db.exec("PRAGMA journal_mode = WAL;");
      await db.exec(SCHEMA_SQL);
      return db;
    } catch (error) {
      throw toIoError("initialize sqlite", error);
    }
  }
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority >= 1),
  status TEXT NOT NULL CHECK (status IN ('todo', 'done')),
  due_date TEXT,
  order_index INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (plan_id) REFERENCES plans (id)
);

CREATE TABLE IF NOT EXISTS subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority >= 1),
  status TEXT NOT NULL CHECK (status IN ('todo', 'done')),
  due_date TEXT,
  order_index INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks (id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_plan_deleted_priority_due
ON tasks(plan_id, deleted_at, priority, due_date);

CREATE INDEX IF NOT EXISTS idx_subtasks_task_deleted_priority_due
ON subtasks(task_id, deleted_at, priority, due_date);
`;

function toIoError(action: string, error: unknown): AppError {
  return new AppError("io_error", `Failed to ${action}: ${toErrorMessage(error)}`);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
