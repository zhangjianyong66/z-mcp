import type { BackendClient, ETFAlertInput } from "./types.js";

const defaultNotifyType = "feishu";

// ToolHandlers 描述本 MCP Server 暴露给注册层的五个 ETF 交易提醒工具。
export interface ToolHandlers {
  list_etf_trade_alerts(args: { page?: number; size?: number }): Promise<unknown>;
  get_etf_trade_alert(args: { id: string }): Promise<unknown>;
  create_etf_trade_alert(args: ETFAlertInput): Promise<unknown>;
  update_etf_trade_alert(args: ETFAlertInput & { id: string }): Promise<unknown>;
  delete_etf_trade_alert(args: { id: string }): Promise<unknown>;
}

// createETFAlertToolHandlers 将 MCP 工具参数映射到后端 client 方法。
export function createETFAlertToolHandlers(client: BackendClient): ToolHandlers {
  return {
    async list_etf_trade_alerts(args) {
      return client.list(args.page ?? 1, args.size ?? 20);
    },
    async get_etf_trade_alert(args) {
      return client.get(args.id);
    },
    async create_etf_trade_alert(args) {
      return client.create(withDefaults(args));
    },
    async update_etf_trade_alert(args) {
      const { id, ...input } = args;
      const existing = input.enabled === undefined ? await client.get(id) : undefined;
      const updateInput = withDefaults({
        ...input,
        enabled: input.enabled ?? readEnabled(existing),
      });
      const result = await client.update(id, updateInput);
      if (result !== null && result !== undefined) {
        return result;
      }
      return {
        success: true,
        operation: "update",
        id,
        data: await client.get(id),
      };
    },
    async delete_etf_trade_alert(args) {
      const result = await client.delete(args.id);
      if (result !== null && result !== undefined) {
        return result;
      }
      return {
        success: true,
        operation: "delete",
        id: args.id,
      };
    },
  };
}

function withDefaults(input: ETFAlertInput): ETFAlertInput {
  return {
    ...input,
    notifyType: input.notifyType ?? defaultNotifyType,
  };
}

function readEnabled(data: unknown): boolean | undefined {
  if (typeof data !== "object" || data === null || !("enabled" in data)) {
    return undefined;
  }
  const enabled = (data as { enabled: unknown }).enabled;
  return typeof enabled === "boolean" ? enabled : undefined;
}

// toMCPTextResult 将后端 JSON 数据序列化为 MCP 文本内容。
export function toMCPTextResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data ?? null, null, 2),
      },
    ],
  };
}
