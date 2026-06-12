## 1. 测试契约更新

- [x] 1.1 更新 `mysql-mcp/tests/config.test.ts`，覆盖 `MYSQL_HOST`、`MYSQL_USER`、`MYSQL_DATABASE` 单数据源配置、默认值、可选值和缺失必填项错误。
- [x] 1.2 更新配置测试，确认仅提供 `MYSQL_DATASOURCES` 时加载失败，不保留多数据源兼容入口。
- [x] 1.3 更新 `mysql-mcp/tests/service.test.ts`，移除 `datasource` 入参相关断言，覆盖查询和元数据工具始终使用绑定 client。
- [x] 1.4 更新服务测试，确认旧的未知 datasource 路由行为和 `listDatasources` 行为已移除。

## 2. 单数据源配置实现

- [x] 2.1 调整 `mysql-mcp/src/types.ts`，将 `AppConfig` 和连接配置从 `datasources` 数组收敛为单数据源结构。
- [x] 2.2 调整 `mysql-mcp/src/config.ts`，解析单数据源环境变量并删除 `MYSQL_DATASOURCES` JSON 数组解析逻辑。
- [x] 2.3 确认 `MysqlPoolClient` 继续接收单数据源配置，并保留现有连接池、超时、SSL 和 `multipleStatements: false` 行为。

## 3. 服务层和工具契约调整

- [x] 3.1 调整 `mysql-mcp/src/service.ts`，让 `MysqlService` 持有单个 client 和默认 database，移除 datasource map、路由和未知 datasource 校验。
- [x] 3.2 调整 `query`、`listDatabases`、`listTables`、`describeTable` 方法签名，移除 `datasource` 参数并保留现有只读校验、limit 和 metadata 查询行为。
- [x] 3.3 调整 `mysql-mcp/src/index.ts`，创建单个 `MysqlPoolClient`，从 `mysql_query`、`list_databases`、`list_tables`、`describe_table` 的 zod schema 中移除 `datasource` 字段。
- [x] 3.4 从 MCP server 注册中删除 `list_datasources` 工具。

## 4. 文档和验证

- [x] 4.1 更新 `mysql-mcp/README.md`，说明一个 `mysql-mcp` server 实例只连接一个 MySQL 数据源。
- [x] 4.2 更新 README 环境变量、MCP 客户端示例和查询示例，移除 `MYSQL_DATASOURCES` 与 `datasource` 参数。
- [x] 4.3 在 README 中增加多个 MCP server 实例访问多个 MySQL 数据源的配置示例。
- [x] 4.4 运行 `cd mysql-mcp && npm test`，确认测试通过。
- [x] 4.5 运行 `cd mysql-mcp && npm run check`，确认 TypeScript 类型检查通过。
