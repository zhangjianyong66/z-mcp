## Context

`mysql-mcp` 当前实现通过 `MYSQL_DATASOURCES` JSON 数组在一个 MCP server 进程内维护多个命名 MySQL 连接，并要求工具调用方传入 `datasource`。这与目标运行模型不一致：数据源应由 MCP server 实例边界表达，一个 `mysql-mcp` 实例只连接一个 MySQL 数据源；如果需要访问多个数据源，应在 MCP 客户端中配置多个 server 条目。

该变更是破坏性变更，不保留旧的 `MYSQL_DATASOURCES` 兼容入口。这样可以避免两套配置模型长期并存，也能减少工具 schema 和服务层的分支逻辑。

## Goals / Non-Goals

**Goals:**

- 将配置模型收敛为单个 MySQL 数据源。
- 移除工具入参中的 `datasource`，所有工具使用当前实例绑定的数据源。
- 移除 `list_datasources` 工具。
- 更新测试和 README，明确多个数据源通过多个 MCP server 实例实现。
- 保留现有只读 SQL 防护、查询 limit 策略、元数据查询能力和错误响应风格。

**Non-Goals:**

- 不支持旧版 `MYSQL_DATASOURCES` 配置。
- 不新增运行时动态切换数据源能力。
- 不新增写入 SQL、DDL、事务或权限管理能力。
- 不引入新的数据库类型或连接管理 UI。

## Decisions

### Decision: 一个 MCP server 实例只绑定一个数据源

实现上恢复 `AppConfig` 为单数据源结构，包含 host、port、user、password、database、ssl、queryTimeoutMs、maxRows。`MysqlPoolClient` 在进程启动时创建一个连接池，`MysqlService` 持有一个 client 和默认 database。

替代方案是保留 `MYSQL_DATASOURCES` 并把单数据源作为特例处理。该方案迁移更平滑，但会继续保留复杂的工具输入和配置解析，不符合本次明确收敛边界的目标。

### Decision: 工具 schema 移除 `datasource`

`mysql_query`、`list_databases`、`list_tables`、`describe_table` 的输入 schema 不再包含 `datasource`。服务层方法也同步移除 datasource 参数，未知数据源校验逻辑随之删除。

替代方案是在工具层保留可选 `datasource` 并忽略或要求固定值。该方案容易误导调用方，以为仍支持多数据源路由，因此不采用。

### Decision: 删除 `list_datasources`

单数据源实例不需要列出多个数据源，删除 `list_datasources` 可以让工具列表与能力边界一致。当前数据源信息通过 MCP server 名称、README 配置示例和默认 database 行为表达。

替代方案是改为 `connection_info` 工具。该工具可能有排查价值，但也会增加暴露连接元信息的表面；本次变更先保持最小工具集。

### Decision: 多数据源通过客户端配置多个 server

README 应展示多个 MCP server 条目分别设置不同 `MYSQL_HOST`、`MYSQL_DATABASE` 和账号信息。例如 `mysql-main`、`mysql-report` 分别启动同一个 `dist/index.js`，但携带不同 env。

该方式利用 MCP 客户端天然的 server 隔离能力，也让不同数据源可以使用不同只读账号和权限范围。

## Risks / Trade-offs

- 现有客户端配置失效 -> 在 README 和 tasks 中明确迁移路径，并将变更标记为 BREAKING。
- 工具名在多个 server 中重复 -> 依赖 MCP 客户端以 server 命名空间区分工具来源；文档中建议 server 名称体现数据源用途。
- 删除 `list_datasources` 后少一个自发现入口 -> 通过清晰的 server 名称和 README 配置约定弥补；如后续确有排查需求，可另起变更评估 `connection_info`。
- 不保留兼容会增加一次性迁移成本 -> 换取更清晰的长期配置模型和更简单的服务层实现。

## Migration Plan

1. 将 `MYSQL_DATASOURCES` 配置拆成多个 MCP server 条目。
2. 每个 server 条目设置单数据源环境变量。
3. 更新调用方，不再传入 `datasource` 参数。
4. 移除对 `list_datasources` 的调用。
5. 运行 `npm test` 和 `npm run check` 验证 `mysql-mcp`。

Rollback 策略是恢复变更前代码和 README，重新使用 `MYSQL_DATASOURCES`；由于不涉及数据库 schema 和持久化数据，回滚只影响 MCP server 部署配置。

## Open Questions

- 无。
