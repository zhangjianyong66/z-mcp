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

test("loadConfigFromEnv applies defaults", () => {
  const config = loadConfigFromEnv({
    MYSQL_HOST: "127.0.0.1",
    MYSQL_USER: "reader",
    MYSQL_DATABASE: "app"
  });

  assert.deepEqual(config, {
    host: "127.0.0.1",
    port: 3306,
    user: "reader",
    password: "",
    database: "app",
    ssl: false,
    queryTimeoutMs: 30000,
    maxRows: 500
  });
});

test("loadConfigFromEnv parses optional values", () => {
  const config = loadConfigFromEnv({
    MYSQL_HOST: "127.0.0.1",
    MYSQL_USER: "reader",
    MYSQL_PASSWORD: "secret",
    MYSQL_DATABASE: "app",
    MYSQL_PORT: "3307",
    MYSQL_SSL: "true",
    MYSQL_QUERY_TIMEOUT_MS: "15000",
    MYSQL_MAX_ROWS: "1000"
  });

  assert.deepEqual(config, {
    host: "127.0.0.1",
    port: 3307,
    user: "reader",
    password: "secret",
    database: "app",
    ssl: true,
    queryTimeoutMs: 15000,
    maxRows: 1000
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
