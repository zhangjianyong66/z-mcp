## Purpose

定义 `mysql-mcp` 的单数据源运行模型：一个 MCP server 实例只绑定一个 MySQL 数据源；多个数据源通过多个 MCP server 实例配置。

## Requirements

### Requirement: Single datasource configuration

`mysql-mcp` SHALL configure exactly one MySQL datasource per MCP server instance using single-datasource environment variables.

#### Scenario: Loads single datasource environment

- **WHEN** the server starts with `MYSQL_HOST`, `MYSQL_USER`, and `MYSQL_DATABASE` set
- **THEN** it SHALL create one MySQL client configuration using those values and defaults for optional settings

#### Scenario: Rejects missing required connection setting

- **WHEN** the server starts without a required single-datasource environment variable
- **THEN** configuration loading SHALL fail with an `invalid_config` error

#### Scenario: Rejects removed multi datasource configuration

- **WHEN** the server is configured only with `MYSQL_DATASOURCES`
- **THEN** configuration loading SHALL fail because the multi-datasource JSON array is no longer supported

### Requirement: Tools use bound datasource

`mysql-mcp` tools SHALL execute against the datasource bound to the current MCP server instance and MUST NOT require or accept a `datasource` selector in tool input.

#### Scenario: Query uses bound datasource

- **WHEN** `mysql_query` is called with a read-only SQL statement and optional query parameters
- **THEN** the query SHALL execute against the current server instance datasource

#### Scenario: Metadata tools use bound datasource

- **WHEN** `list_databases`, `list_tables`, or `describe_table` is called
- **THEN** the metadata query SHALL execute against the current server instance datasource

#### Scenario: Datasource selector is absent from tool schemas

- **WHEN** the MCP server exposes `mysql_query`, `list_databases`, `list_tables`, and `describe_table`
- **THEN** their input schemas SHALL NOT include a `datasource` field

### Requirement: Datasource listing removed

`mysql-mcp` SHALL NOT expose a `list_datasources` tool.

#### Scenario: Server tools are listed

- **WHEN** a client lists tools from a `mysql-mcp` server instance
- **THEN** `list_datasources` SHALL NOT be present

### Requirement: Multiple datasources use multiple server instances

The documented deployment model for accessing multiple MySQL datasources SHALL be configuring multiple `mysql-mcp` server instances in the MCP client.

#### Scenario: README documents multiple server instances

- **WHEN** a user reads the `mysql-mcp` README
- **THEN** it SHALL explain that each server instance connects to one datasource and show how to configure multiple server entries for multiple datasources

#### Scenario: Different instances carry different credentials

- **WHEN** a user needs access to two MySQL datasources
- **THEN** the documented configuration SHALL show separate MCP server entries with separate single-datasource environment variables

### Requirement: Read-only behavior preserved

`mysql-mcp` SHALL preserve existing read-only SQL validation, result limiting, metadata inspection, and JSON response behavior while changing the datasource model.

#### Scenario: Write SQL remains rejected

- **WHEN** `mysql_query` receives write, DDL, transaction, lock, session modification, or stored procedure SQL
- **THEN** it SHALL reject the SQL before executing against MySQL

#### Scenario: Query results remain limited

- **WHEN** `mysql_query` executes a read query without an explicit limit
- **THEN** it SHALL apply the configured maximum row limit and report whether the response was truncated
