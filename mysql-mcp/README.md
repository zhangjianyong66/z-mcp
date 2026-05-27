# MySQL MCP

只读 MySQL MCP 服务。支持通过环境变量配置多个 MySQL 数据源，并在工具调用时按数据源名称选择连接。

## 安装

```bash
npm install
npm run build
```

## 环境变量

```env
MYSQL_DATASOURCES='[
  {
    "name": "main",
    "description": "主业务库",
    "host": "127.0.0.1",
    "port": 3306,
    "user": "readonly_user",
    "password": "secret",
    "database": "app",
    "ssl": false
  },
  {
    "name": "analytics",
    "description": "分析库",
    "host": "127.0.0.1",
    "port": 3306,
    "user": "readonly_user",
    "password": "secret",
    "database": "analytics",
    "ssl": false
  }
]'
MYSQL_QUERY_TIMEOUT_MS=30000
MYSQL_MAX_ROWS=500
```

`MYSQL_DATASOURCES` 必须是非空 JSON 数组。每个数据源需要唯一的 `name`，工具调用时用这个名称选择连接。`description` 可用于说明数据源用途。

建议每个数据源都使用只有只读权限的 MySQL 账号。服务会在应用层拒绝写入 SQL，但数据库账号权限仍然是最强保护。

## 工具

- `list_datasources`: 列出已配置数据源的名称、描述和默认数据库。
- `mysql_query`: 在指定数据源执行只读 SQL。支持 `SELECT`、`SHOW`、`DESCRIBE`、`DESC`、`EXPLAIN` 和只读 `WITH`。
- `list_databases`: 列出指定数据源当前账号可见的数据库。
- `list_tables`: 列出指定数据源配置数据库或指定数据库里的表。
- `describe_table`: 查看指定数据源表字段结构。

## MCP 客户端示例

```json
{
  "mcpServers": {
    "mysql": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/mysql-mcp/dist/index.js"],
      "env": {
        "MYSQL_DATASOURCES": "[{\"name\":\"main\",\"description\":\"主业务库\",\"host\":\"127.0.0.1\",\"port\":3306,\"user\":\"readonly_user\",\"password\":\"secret\",\"database\":\"app\",\"ssl\":false}]"
      }
    }
  }
}
```

## 查询示例

```json
{
  "datasource": "main",
  "sql": "select id, name from users where status = ?",
  "params": ["active"],
  "limit": 50
}
```

服务会拒绝多语句、注释、写入、DDL、事务、锁、会话修改和存储过程调用。
