import assert from "node:assert/strict";
import test from "node:test";
import { assertReadOnlySql, applyLimit } from "../src/sql-guard.js";
import { AppError } from "../src/types.js";

test("assertReadOnlySql accepts read statements", () => {
  for (const sql of [
    "select * from users",
    "SHOW TABLES",
    "describe users",
    "DESC users",
    "EXPLAIN SELECT * FROM users",
    "WITH active AS (SELECT * FROM users) SELECT * FROM active"
  ]) {
    assert.doesNotThrow(() => assertReadOnlySql(sql));
  }
});

test("assertReadOnlySql rejects writes ddl transactions comments and multiple statements", () => {
  for (const sql of [
    "insert into users(id) values(1)",
    "update users set name = 'a'",
    "delete from users",
    "drop table users",
    "alter table users add column x int",
    "set names utf8mb4",
    "begin",
    "lock tables users read",
    "call refresh_stats()",
    "select * from users; select * from orders",
    "select * from users -- hidden",
    "select * from users /* hidden */"
  ]) {
    assert.throws(
      () => assertReadOnlySql(sql),
      (error: unknown) => error instanceof AppError && error.code === "query_rejected",
      sql
    );
  }
});

test("applyLimit appends limit only to select and with queries without explicit limit", () => {
  assert.deepEqual(applyLimit("select * from users", 20), {
    sql: "select * from users LIMIT ?",
    paramsToAppend: [20]
  });
  assert.deepEqual(applyLimit("WITH active AS (SELECT * FROM users) SELECT * FROM active", 20), {
    sql: "WITH active AS (SELECT * FROM users) SELECT * FROM active LIMIT ?",
    paramsToAppend: [20]
  });
  assert.deepEqual(applyLimit("select * from users limit 10", 20), {
    sql: "select * from users limit 10",
    paramsToAppend: []
  });
  assert.deepEqual(applyLimit("show tables", 20), {
    sql: "show tables",
    paramsToAppend: []
  });
});

