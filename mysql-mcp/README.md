# MySQL MCP

只读 MySQL MCP 服务。一个 `mysql-mcp` server 实例只连接一个 MySQL 数据源；如果需要同时访问多个数据源，请在 MCP 客户端中配置多个 `mysql-mcp` server 实例。

## 安装

```bash
npm install
npm run build
```

## 环境变量

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=readonly_user
MYSQL_PASSWORD=secret
MYSQL_DATABASE=app
MYSQL_SSL=false
MYSQL_QUERY_TIMEOUT_MS=30000
MYSQL_MAX_ROWS=500
```

`MYSQL_HOST`、`MYSQL_USER`、`MYSQL_DATABASE` 必填。`MYSQL_PORT` 默认 `3306`，`MYSQL_PASSWORD` 默认空字符串，`MYSQL_SSL` 默认 `false`，`MYSQL_QUERY_TIMEOUT_MS` 默认 `30000`，`MYSQL_MAX_ROWS` 默认 `500` 且最大允许 `5000`。

建议使用只有只读权限的 MySQL 账号。服务会在应用层拒绝写入 SQL，但数据库账号权限仍然是最强保护。

## 工具

- `mysql_query`: 在当前数据源执行只读 SQL。支持 `SELECT`、`SHOW`、`DESCRIBE`、`DESC`、`EXPLAIN` 和只读 `WITH`。
- `list_databases`: 列出当前账号可见的数据库。
- `list_tables`: 列出当前数据源配置数据库或指定数据库里的表。
- `describe_table`: 查看当前数据源中指定表的字段结构。

## MCP 客户端示例

```json
{
  "mcpServers": {
    "mysql": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/mysql-mcp/dist/index.js"],
      "env": {
        "MYSQL_HOST": "127.0.0.1",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "readonly_user",
        "MYSQL_PASSWORD": "secret",
        "MYSQL_DATABASE": "app",
        "MYSQL_SSL": "false"
      }
    }
  }
}
```

## 多数据源客户端示例

多个 MySQL 数据源通过多个 MCP server 实例表达，每个实例携带自己的环境变量和只读账号。

```json
{
  "mcpServers": {
    "mysql-main": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/mysql-mcp/dist/index.js"],
      "env": {
        "MYSQL_HOST": "main-db.local",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "main_readonly",
        "MYSQL_PASSWORD": "secret",
        "MYSQL_DATABASE": "app"
      }
    },
    "mysql-analytics": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/mysql-mcp/dist/index.js"],
      "env": {
        "MYSQL_HOST": "analytics-db.local",
        "MYSQL_PORT": "3306",
        "MYSQL_USER": "analytics_readonly",
        "MYSQL_PASSWORD": "secret",
        "MYSQL_DATABASE": "analytics"
      }
    }
  }
}
```

## 查询示例

```json
{
  "sql": "select id, name from users where status = ?",
  "params": ["active"],
  "limit": 50
}
```

服务会拒绝多语句、注释、写入、DDL、事务、锁、会话修改和存储过程调用。
