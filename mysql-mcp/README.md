# MySQL MCP

只读 MySQL MCP 服务。当前版本只支持一个通过环境变量配置的固定 MySQL 连接。

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

建议使用只有只读权限的 MySQL 账号。服务会在应用层拒绝写入 SQL，但数据库账号权限仍然是最强保护。

## 工具

- `mysql_query`: 执行只读 SQL。支持 `SELECT`、`SHOW`、`DESCRIBE`、`DESC`、`EXPLAIN` 和只读 `WITH`。
- `list_databases`: 列出当前账号可见的数据库。
- `list_tables`: 列出配置数据库或指定数据库里的表。
- `describe_table`: 查看表字段结构。

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
        "MYSQL_DATABASE": "app"
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

