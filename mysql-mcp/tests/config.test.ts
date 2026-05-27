import assert from "node:assert/strict";
import test from "node:test";
import { loadConfigFromEnv } from "../src/config.js";
import { AppError } from "../src/types.js";

test("loadConfigFromEnv requires MYSQL_DATASOURCES", () => {
  assert.throws(
    () => loadConfigFromEnv({}),
    (error: unknown) => error instanceof AppError && error.code === "invalid_config"
  );
});

test("loadConfigFromEnv parses datasources and applies service defaults", () => {
  const config = loadConfigFromEnv({
    MYSQL_DATASOURCES: JSON.stringify([
      {
        name: "main",
        description: "主业务库",
        host: "127.0.0.1",
        user: "reader",
        database: "app"
      }
    ])
  });

  assert.deepEqual(config, {
    queryTimeoutMs: 30000,
    maxRows: 500,
    datasources: [
      {
        name: "main",
        description: "主业务库",
        host: "127.0.0.1",
        port: 3306,
        user: "reader",
        password: "",
        database: "app",
        ssl: false
      }
    ]
  });
});

test("loadConfigFromEnv parses datasource optional values", () => {
  const config = loadConfigFromEnv({
    MYSQL_DATASOURCES: JSON.stringify([
      {
        name: "analytics",
        description: "分析库",
        host: "127.0.0.1",
        port: 3307,
        user: "reader",
        password: "secret",
        database: "analytics",
        ssl: true
      }
    ]),
    MYSQL_QUERY_TIMEOUT_MS: "15000",
    MYSQL_MAX_ROWS: "1000"
  });

  assert.deepEqual(config, {
    queryTimeoutMs: 15000,
    maxRows: 1000,
    datasources: [
      {
        name: "analytics",
        description: "分析库",
        host: "127.0.0.1",
        port: 3307,
        user: "reader",
        password: "secret",
        database: "analytics",
        ssl: true
      }
    ]
  });
});

test("loadConfigFromEnv rejects MYSQL_MAX_ROWS above 5000", () => {
  assert.throws(
    () =>
      loadConfigFromEnv({
        MYSQL_DATASOURCES: JSON.stringify([
          {
            name: "main",
            host: "127.0.0.1",
            user: "reader",
            database: "app"
          }
        ]),
        MYSQL_MAX_ROWS: "5001"
      }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "invalid_config" &&
      error.message.includes("MYSQL_MAX_ROWS")
  );
});

test("loadConfigFromEnv rejects duplicate datasource names", () => {
  assert.throws(
    () =>
      loadConfigFromEnv({
        MYSQL_DATASOURCES: JSON.stringify([
          {
            name: "main",
            host: "127.0.0.1",
            user: "reader",
            database: "app"
          },
          {
            name: "main",
            host: "127.0.0.2",
            user: "reader",
            database: "other"
          }
        ])
      }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "invalid_config" &&
      error.message.includes("Duplicate datasource name")
  );
});
