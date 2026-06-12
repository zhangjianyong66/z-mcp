## Why

当前 `mysql-mcp` 使用 `MYSQL_DATASOURCES` 在单个 MCP server 进程内配置多个命名 MySQL 数据源，但项目目标是让一个 `mysql-mcp` 实例只绑定一个 MySQL 数据源。这样可以让数据源边界与 MCP server 边界一致，简化工具入参、运行配置和权限隔离。

## What Changes

- **BREAKING**: 移除 `MYSQL_DATASOURCES` 多数据源 JSON 数组配置。
- **BREAKING**: 恢复单数据源环境变量配置：`MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`、`MYSQL_SSL`、`MYSQL_QUERY_TIMEOUT_MS`、`MYSQL_MAX_ROWS`。
- **BREAKING**: `mysql_query`、`list_databases`、`list_tables`、`describe_table` 不再接收 `datasource` 参数，始终使用当前 MCP server 实例绑定的数据源。
- **BREAKING**: 移除 `list_datasources` 工具，多个数据源通过配置多个 `mysql-mcp` server 实例实现。
- 更新 README，明确“一个 MCP server 实例 = 一个 MySQL 数据源”，并提供多个 server 实例访问多个数据库的配置示例。
- 更新测试，覆盖单数据源配置解析、工具行为和旧多数据源入口移除后的服务层语义。

## Capabilities

### New Capabilities

- `mysql-mcp-single-datasource`: 定义 `mysql-mcp` 单数据源运行模型、工具输入契约和多数据源部署方式。

### Modified Capabilities

- 无。

## Impact

- 影响 `mysql-mcp/src/config.ts`、`mysql-mcp/src/types.ts`、`mysql-mcp/src/service.ts`、`mysql-mcp/src/index.ts` 和相关测试。
- 影响 `mysql-mcp/README.md` 的环境变量、工具入参和 MCP 客户端配置示例。
- 对当前使用 `MYSQL_DATASOURCES` 或传入 `datasource` 参数的客户端配置是破坏性变更，需要迁移为多个 MCP server 实例配置。
