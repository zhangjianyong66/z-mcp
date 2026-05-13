import assert from "node:assert/strict";
import test from "node:test";
import { MysqlService } from "../src/service.js";
import { AppError, type MysqlClient, type QueryParams } from "../src/types.js";

class FakeClient implements MysqlClient {
  calls: Array<{ sql: string; params?: QueryParams }> = [];

  constructor(private readonly responses: Array<{ rows: unknown[]; fields?: Array<{ name: string }> }>) {}

  async query(sql: string, params?: QueryParams): Promise<{ rows: unknown[]; fields: Array<{ name: string }> }> {
    this.calls.push({ sql, params });
    const response = this.responses.shift() ?? { rows: [] };
    return { rows: response.rows, fields: response.fields ?? [] };
  }

  async close(): Promise<void> {}
}

function serviceWith(client: FakeClient): MysqlService {
  return new MysqlService(client, { defaultDatabase: "app", maxRows: 2 });
}

test("query appends limit passes params and formats rows", async () => {
  const client = new FakeClient([{ rows: [{ id: 1 }, { id: 2 }, { id: 3 }], fields: [{ name: "id" }] }]);
  const service = serviceWith(client);

  const result = await service.query({ sql: "select * from users where role = ?", params: ["admin"] });

  assert.deepEqual(client.calls[0], {
    sql: "select * from users where role = ? LIMIT ?",
    params: ["admin", 2]
  });
  assert.deepEqual(result, {
    rows: [{ id: 1 }, { id: 2 }],
    fields: ["id"],
    row_count: 2,
    truncated: true
  });
});

test("query rejects write statements before hitting database", async () => {
  const client = new FakeClient([]);
  const service = serviceWith(client);

  await assert.rejects(
    () => service.query({ sql: "delete from users" }),
    (error: unknown) => error instanceof AppError && error.code === "query_rejected"
  );
  assert.equal(client.calls.length, 0);
});

test("listDatabases maps SHOW DATABASES rows", async () => {
  const client = new FakeClient([{ rows: [{ Database: "app" }, { Database: "mysql" }] }]);
  const service = serviceWith(client);

  assert.deepEqual(await service.listDatabases(), { databases: ["app", "mysql"] });
  assert.equal(client.calls[0]?.sql, "SHOW DATABASES");
});

test("listTables uses information_schema with configured database", async () => {
  const client = new FakeClient([{ rows: [{ table_name: "users", table_type: "BASE TABLE" }] }]);
  const service = serviceWith(client);

  assert.deepEqual(await service.listTables({}), {
    database: "app",
    tables: [{ name: "users", type: "BASE TABLE" }]
  });
  assert.deepEqual(client.calls[0]?.params, ["app"]);
});

test("describeTable uses information_schema columns", async () => {
  const client = new FakeClient([
    {
      rows: [
        {
          column_name: "id",
          data_type: "bigint",
          is_nullable: "NO",
          column_key: "PRI",
          column_default: null,
          extra: "auto_increment"
        }
      ]
    }
  ]);
  const service = serviceWith(client);

  assert.deepEqual(await service.describeTable({ table: "users" }), {
    database: "app",
    table: "users",
    columns: [
      {
        name: "id",
        data_type: "bigint",
        nullable: false,
        key: "PRI",
        default: null,
        extra: "auto_increment"
      }
    ]
  });
  assert.deepEqual(client.calls[0]?.params, ["app", "users"]);
});

