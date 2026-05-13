# MySQL MCP Design

Date: 2026-05-13

## Goal

Create a new MCP server directory for querying a MySQL database. The first version supports one fixed MySQL connection configured through environment variables. It must be read-only: tools may inspect metadata and run read queries, but must not modify database data or schema.

## Scope

In scope:

- Add a new independent `mysql-mcp/` TypeScript package.
- Support MySQL only.
- Use one configured connection target.
- Provide SQL query and metadata inspection tools.
- Enforce read-only behavior in application code and MySQL client configuration.
- Add focused tests that do not require a real MySQL server.

Out of scope:

- Multiple named database connections.
- Write operations.
- Schema migrations.
- Connection management UI.
- Support for PostgreSQL, SQLite, SQL Server, or other databases.

## Package Structure

The new package follows the existing repository pattern:

```text
mysql-mcp/
  README.md
  package.json
  tsconfig.json
  src/
    config.ts
    index.ts
    mysql-client.ts
    service.ts
    sql-guard.ts
    types.ts
  tests/
    config.test.ts
    service.test.ts
    sql-guard.test.ts
```

`index.ts` registers MCP tools and starts a stdio MCP server. `service.ts` owns tool behavior. `mysql-client.ts` wraps `mysql2/promise` so service tests can use a fake client. `sql-guard.ts` contains read-only SQL validation.

## Configuration

The server reads these environment variables:

- `MYSQL_HOST`: required.
- `MYSQL_PORT`: optional, defaults to `3306`.
- `MYSQL_USER`: required.
- `MYSQL_PASSWORD`: optional, defaults to an empty string.
- `MYSQL_DATABASE`: required default database.
- `MYSQL_SSL`: optional boolean, defaults to `false`.
- `MYSQL_QUERY_TIMEOUT_MS`: optional integer, defaults to `30000`.
- `MYSQL_MAX_ROWS`: optional integer, defaults to `500`, maximum accepted value `5000`.

The MySQL connection uses `multipleStatements: false`.

## MCP Tools

### `mysql_query`

Runs a read-only SQL query.

Input:

- `sql`: non-empty string.
- `params`: optional JSON scalar array for parameterized placeholders.
- `limit`: optional integer from 1 to `MYSQL_MAX_ROWS`. Defaults to `MYSQL_MAX_ROWS`.

Behavior:

- Validate the SQL with `sql-guard.ts`.
- Reject multi-statement input.
- Run parameterized query through the MySQL client.
- Return rows as JSON, field names, `row_count`, and `truncated`.
- If the SQL is a simple `SELECT` or read-only `WITH` query without an explicit `LIMIT`, append `LIMIT ?` using the requested limit value.
- If the SQL already has an explicit `LIMIT`, do not rewrite it. Return at most the configured max rows and set `truncated: true` when extra rows were omitted from the response.
- For `SHOW`, `DESCRIBE`, `DESC`, and `EXPLAIN`, do not rewrite the SQL. Return at most the configured max rows and set `truncated` when needed.

### `list_databases`

Lists visible databases using `SHOW DATABASES`.

Input: none.

Output: database names.

### `list_tables`

Lists tables in the configured database or an explicitly supplied database.

Input:

- `database`: optional string. Defaults to `MYSQL_DATABASE`.

Output: table names and table type where available.

Implementation uses `information_schema.tables` with parameterized values instead of string-concatenating identifiers.

### `describe_table`

Returns table columns and key metadata.

Input:

- `table`: required string.
- `database`: optional string. Defaults to `MYSQL_DATABASE`.

Output:

- column name
- data type
- nullability
- key type
- default value
- extra attributes

Implementation uses `information_schema.columns` with parameterized values.

## Read-Only Guard

The guard allows SQL that starts with one of:

- `SELECT`
- `SHOW`
- `DESCRIBE`
- `DESC`
- `EXPLAIN`
- `WITH`, only when the statement is a read query

The guard rejects:

- Multiple statements.
- SQL containing semicolon-separated commands.
- Comments that can hide additional statements.
- Data writes such as `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `TRUNCATE`, `LOAD`.
- Schema changes such as `CREATE`, `ALTER`, `DROP`, `RENAME`.
- Permission or session changes such as `GRANT`, `REVOKE`, `SET`.
- Transaction and lock commands such as `BEGIN`, `COMMIT`, `ROLLBACK`, `LOCK`, `UNLOCK`.
- Stored procedure calls such as `CALL`.

The guard is a defense layer, not a replacement for database permissions. The README will recommend a MySQL user with only read permissions.

## Error Handling

Tool responses follow the repository's JSON style:

```json
{
  "code": 0,
  "data": {},
  "request_meta": {
    "tool": "mysql_query",
    "generated_at": "2026-05-13T00:00:00.000Z"
  }
}
```

Errors return `isError: true` with JSON:

```json
{
  "code": "invalid_input",
  "message": "Only read-only SQL statements are allowed"
}
```

Common error codes:

- `invalid_config`
- `invalid_input`
- `query_rejected`
- `database_error`
- `internal_error`

## Testing

Tests use Node's built-in test runner, matching the existing packages.

Coverage:

- Config parsing validates required fields, defaults, booleans, numbers, and max row bounds.
- SQL guard accepts read statements and rejects writes, DDL, transaction commands, stored procedure calls, comments, and multiple statements.
- Service metadata tools call expected parameterized queries.
- `mysql_query` passes params to the client, enforces limits, formats rows and fields, and maps database errors.

Service tests use a fake client object instead of connecting to a real MySQL database.

## README

The package README documents:

- Installation.
- Environment variables.
- MCP client configuration example.
- Tool descriptions and example inputs.
- Read-only limitations.
- Recommendation to create a dedicated read-only MySQL account.
