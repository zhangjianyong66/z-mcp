import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfigFromEnv } from "./config.js";
import { MysqlPoolClient } from "./mysql-client.js";
import { MysqlService } from "./service.js";
import { AppError, type ToolResult } from "./types.js";

function toToolResult<T>(tool: string, data: T): { content: Array<{ type: "text"; text: string }> } {
  const body: ToolResult<T> = {
    code: 0,
    data,
    request_meta: {
      tool,
      generated_at: new Date().toISOString()
    }
  };

  return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
}

function toToolError(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const appError =
    error instanceof AppError
      ? error
      : new AppError("internal_error", error instanceof Error ? error.message : String(error));

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            code: appError.code,
            message: appError.message,
            ...(appError.details ? { details: appError.details } : {})
          },
          null,
          2
        )
      }
    ],
    isError: true
  };
}

const config = loadConfigFromEnv();
const client = new MysqlPoolClient(config);
const service = new MysqlService(client, {
  defaultDatabase: config.database,
  maxRows: config.maxRows
});

const server = new McpServer({
  name: "mysql-mcp",
  version: "0.1.0"
});

server.tool(
  "mysql_query",
  "执行只读 MySQL SQL 查询。仅允许 SELECT、SHOW、DESCRIBE、DESC、EXPLAIN 和只读 WITH。",
  {
    sql: z.string().trim().min(1).describe("只读 SQL"),
    params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().describe("SQL 占位符参数"),
    limit: z.number().int().min(1).max(config.maxRows).optional().describe("最多返回行数")
  },
  async ({ sql, params, limit }) => {
    try {
      return toToolResult("mysql_query", await service.query({ sql, params, limit }));
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool("list_databases", "列出当前账号可见的 MySQL 数据库。", {}, async () => {
  try {
    return toToolResult("list_databases", await service.listDatabases());
  } catch (error) {
    return toToolError(error);
  }
});

server.tool(
  "list_tables",
  "列出数据库中的表。",
  {
    database: z.string().trim().min(1).optional().describe("数据库名，默认使用 MYSQL_DATABASE")
  },
  async ({ database }) => {
    try {
      return toToolResult("list_tables", await service.listTables({ database }));
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "describe_table",
  "查看表字段结构。",
  {
    database: z.string().trim().min(1).optional().describe("数据库名，默认使用 MYSQL_DATABASE"),
    table: z.string().trim().min(1).describe("表名")
  },
  async ({ database, table }) => {
    try {
      return toToolResult("describe_table", await service.describeTable({ database, table }));
    } catch (error) {
      return toToolError(error);
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

