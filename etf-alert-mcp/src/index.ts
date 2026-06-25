#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { ETFAlertBackendClient } from "./backend-client.js";
import { loadConfig } from "./config.js";
import { createETFAlertToolHandlers, toMCPTextResult } from "./tools.js";

// alertInputShape 定义新增和修改工具共享的 ETF 提醒参数 schema。
const alertInputShape = {
  etfCode: z.string().describe("ETF 代码，例如 510300 或 159570"),
  etfName: z.string().optional().describe("ETF 名称，可选"),
  actionType: z.enum(["buy", "sell"]).describe("交易动作：buy 买入，sell 卖出"),
  shares: z.number().int().positive().describe("提醒涉及的份额"),
  conditionType: z.enum(["price_gte", "price_lte"]).describe("价格条件：price_gte 大于等于，price_lte 小于等于"),
  triggerPrice: z.number().positive().describe("触发价格"),
  messageTemplate: z.string().optional().describe("自定义通知模板，可选"),
  notifyType: z.enum(["email", "feishu"]).optional().describe("通知方式：email 或 feishu，默认 feishu"),
  email: z.string().optional().describe("邮箱通知地址，飞书通知可为空"),
  enabled: z.boolean().optional().describe("是否启用提醒"),
  state: z.enum(["active", "closed"]).optional().describe("提醒状态"),
  cooldownMinutes: z.number().int().positive().optional().describe("触发冷却分钟数"),
};

// registerETFAlertTools 把五个 ETF 交易提醒工具注册到 MCP Server。
function registerETFAlertTools(server: McpServer, handlers: ReturnType<typeof createETFAlertToolHandlers>): void {
  server.registerTool(
    "list_etf_trade_alerts",
    {
      title: "List ETF trade alerts",
      description: "分页查看配置 MCP 用户的 ETF 交易提醒",
      inputSchema: {
        page: z.number().int().positive().optional().describe("页码，默认 1"),
        size: z.number().int().positive().optional().describe("每页数量，默认 20"),
      },
    },
    async (args) => toMCPTextResult(await handlers.list_etf_trade_alerts(args)),
  );

  server.registerTool(
    "get_etf_trade_alert",
    {
      title: "Get ETF trade alert",
      description: "按 ID 查看配置 MCP 用户自己的 ETF 交易提醒",
      inputSchema: { id: z.string().describe("ETF 交易提醒 ID") },
    },
    async (args) => toMCPTextResult(await handlers.get_etf_trade_alert(args)),
  );

  server.registerTool(
    "create_etf_trade_alert",
    {
      title: "Create ETF trade alert",
      description: "新增配置 MCP 用户的 ETF 交易提醒",
      inputSchema: alertInputShape,
    },
    async (args) => toMCPTextResult(await handlers.create_etf_trade_alert(args)),
  );

  server.registerTool(
    "update_etf_trade_alert",
    {
      title: "Update ETF trade alert",
      description: "更新配置 MCP 用户自己的 ETF 交易提醒",
      inputSchema: { id: z.string().describe("ETF 交易提醒 ID"), ...alertInputShape },
    },
    async (args) => toMCPTextResult(await handlers.update_etf_trade_alert(args)),
  );

  server.registerTool(
    "delete_etf_trade_alert",
    {
      title: "Delete ETF trade alert",
      description: "物理删除配置 MCP 用户自己的 ETF 交易提醒",
      inputSchema: { id: z.string().describe("ETF 交易提醒 ID") },
    },
    async (args) => toMCPTextResult(await handlers.delete_etf_trade_alert(args)),
  );
}

// main 创建 stdio MCP Server，并把工具请求转发到 Go 后端 MCP API。
async function main(): Promise<void> {
  const config = loadConfig();
  const client = new ETFAlertBackendClient(config);
  const handlers = createETFAlertToolHandlers(client);
  const server = new McpServer({ name: "z-tools-etf-alert-mcp", version: "0.1.0" });
  registerETFAlertTools(server, handlers);
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  // MCP stdio 进程只能把启动失败写入 stderr，避免污染 stdout 协议流。
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
