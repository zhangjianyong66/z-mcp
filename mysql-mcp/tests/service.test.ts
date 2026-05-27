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

function serviceWith(clients: Record<string, FakeClient> | FakeClient): MysqlService {
  const datasourceClients =
    clients instanceof FakeClient
      ? new Map([
          [
            "main",
            {
              description: "主业务库",
              database: "app",
              client: clients
            }
          ]
        ])
      : new Map(
          Object.entries(clients).map(([name, client]) => [
            name,
            {
              description: `${name} datasource`,
              database: name === "analytics" ? "analytics" : "app",
              client
            }
          ])
        );

  return new MysqlService(datasourceClients, { maxRows: 2 });
}

test("query appends limit passes params and formats rows", async () => {
  const client = new FakeClient([{ rows: [{ id: 1 }, { id: 2 }, { id: 3 }], fields: [{ name: "id" }] }]);
  const service = serviceWith(client);

  const result = await service.query({ datasource: "main", sql: "select * from users where role = ?", params: ["admin"] });

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
    () => service.query({ datasource: "main", sql: "delete from users" }),
    (error: unknown) => error instanceof AppError && error.code === "query_rejected"
  );
  assert.equal(client.calls.length, 0);
});

test("query routes to datasource by name", async () => {
  const main = new FakeClient([{ rows: [{ id: 1 }], fields: [{ name: "id" }] }]);
  const analytics = new FakeClient([{ rows: [{ id: 2 }], fields: [{ name: "id" }] }]);
  const service = serviceWith({ main, analytics });

  assert.deepEqual(await service.query({ datasource: "analytics", sql: "select id from events" }), {
    rows: [{ id: 2 }],
    fields: ["id"],
    row_count: 1,
    truncated: false
  });
  assert.equal(main.calls.length, 0);
  assert.equal(analytics.calls[0]?.sql, "select id from events LIMIT ?");
});

test("query rejects unknown datasource before hitting database", async () => {
  const main = new FakeClient([]);
  const service = serviceWith({ main });

  await assert.rejects(
    () => service.query({ datasource: "missing", sql: "select 1" }),
    (error: unknown) =>
      error instanceof AppError && error.code === "invalid_input" && error.message.includes("Unknown datasource")
  );
  assert.equal(main.calls.length, 0);
});

test("listDatasources exposes names descriptions and default databases", () => {
  const main = new FakeClient([]);
  const analytics = new FakeClient([]);
  const service = serviceWith({ main, analytics });

  assert.deepEqual(service.listDatasources(), {
    datasources: [
      { name: "analytics", description: "analytics datasource", database: "analytics" },
      { name: "main", description: "main datasource", database: "app" }
    ]
  });
});

test("listDatabases maps SHOW DATABASES rows", async () => {
  const client = new FakeClient([{ rows: [{ Database: "app" }, { Database: "mysql" }] }]);
  const service = serviceWith(client);

  assert.deepEqual(await service.listDatabases({ datasource: "main" }), { databases: ["app", "mysql"] });
  assert.equal(client.calls[0]?.sql, "SHOW DATABASES");
});

test("listTables uses information_schema with configured database", async () => {
  const client = new FakeClient([{ rows: [{ table_name: "users", table_type: "BASE TABLE" }] }]);
  const service = serviceWith(client);

  assert.deepEqual(await service.listTables({ datasource: "main" }), {
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

  assert.deepEqual(await service.describeTable({ datasource: "main", table: "users" }), {
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
