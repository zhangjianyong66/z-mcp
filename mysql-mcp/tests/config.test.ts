import assert from "node:assert/strict";
import test from "node:test";
import { loadConfigFromEnv } from "../src/config.js";
import { AppError } from "../src/types.js";

test("loadConfigFromEnv requires host user and database", () => {
  assert.throws(
    () => loadConfigFromEnv({}),
    (error: unknown) => error instanceof AppError && error.code === "invalid_config"
  );
});

test("loadConfigFromEnv parses single datasource and applies service defaults", () => {
  const config = loadConfigFromEnv({
    MYSQL_HOST: "127.0.0.1",
    MYSQL_USER: "reader",
    MYSQL_DATABASE: "app"
  });

  assert.deepEqual(config, {
    queryTimeoutMs: 30000,
    maxRows: 500,
    host: "127.0.0.1",
    port: 3306,
    user: "reader",
    password: "",
    database: "app",
    ssl: false
  });
});

test("loadConfigFromEnv parses optional values", () => {
  const config = loadConfigFromEnv({
    MYSQL_HOST: "127.0.0.1",
    MYSQL_PORT: "3307",
    MYSQL_USER: "reader",
    MYSQL_PASSWORD: "secret",
    MYSQL_DATABASE: "analytics",
    MYSQL_SSL: "true",
    MYSQL_QUERY_TIMEOUT_MS: "15000",
    MYSQL_MAX_ROWS: "1000"
  });

  assert.deepEqual(config, {
    queryTimeoutMs: 15000,
    maxRows: 1000,
    host: "127.0.0.1",
    port: 3307,
    user: "reader",
    password: "secret",
    database: "analytics",
    ssl: true
  });
});

test("loadConfigFromEnv rejects MYSQL_MAX_ROWS above 5000", () => {
  assert.throws(
    () =>
      loadConfigFromEnv({
        MYSQL_HOST: "127.0.0.1",
        MYSQL_USER: "reader",
        MYSQL_DATABASE: "app",
        MYSQL_MAX_ROWS: "5001"
      }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "invalid_config" &&
      error.message.includes("MYSQL_MAX_ROWS")
  );
});

test("loadConfigFromEnv rejects removed MYSQL_DATASOURCES-only configuration", () => {
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
        ])
      }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "invalid_config" &&
      error.message.includes("MYSQL_HOST")
  );
});
