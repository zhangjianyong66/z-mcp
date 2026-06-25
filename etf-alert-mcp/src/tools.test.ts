import assert from "node:assert/strict";
import test from "node:test";

import { createETFAlertToolHandlers, toMCPTextResult } from "./tools.js";
import type { ETFAlertInput } from "./types.js";

// createInput 生成工具 handler 测试需要的最小合法 ETF 提醒输入。
function createInput(): ETFAlertInput {
  return {
    etfCode: "159570",
    actionType: "buy",
    shares: 1000,
    conditionType: "price_lte",
    triggerPrice: 1.3,
    notifyType: "feishu",
    enabled: true,
    state: "active",
  };
}

test("tool handlers call backend client methods", async () => {
  const calls: string[] = [];
  const handlers = createETFAlertToolHandlers({
    list: async (page, size) => {
      calls.push(`list:${page}:${size}`);
      return { records: [] };
    },
    get: async (id) => {
      calls.push(`get:${id}`);
      return { id };
    },
    create: async (input) => {
      calls.push(`create:${input.etfCode}`);
      return { id: "1001" };
    },
    update: async (id, input) => {
      calls.push(`update:${id}:${input.etfCode}`);
      return null;
    },
    delete: async (id) => {
      calls.push(`delete:${id}`);
      return null;
    },
  });

  await handlers.list_etf_trade_alerts({ page: 1, size: 20 });
  await handlers.get_etf_trade_alert({ id: "1001" });
  await handlers.create_etf_trade_alert(createInput());
  await handlers.update_etf_trade_alert({ id: "1001", ...createInput() });
  await handlers.delete_etf_trade_alert({ id: "1001" });

  assert.deepEqual(calls, [
    "list:1:20",
    "get:1001",
    "create:159570",
    "update:1001:159570",
    "delete:1001",
  ]);
});

test("create alert defaults notifyType to feishu when omitted", async () => {
  let createdInput: ETFAlertInput | undefined;
  const handlers = createETFAlertToolHandlers({
    list: async () => ({ records: [] }),
    get: async (id) => ({ id }),
    create: async (input) => {
      createdInput = input;
      return { id: "1002" };
    },
    update: async () => null,
    delete: async () => null,
  });

  const { notifyType: _notifyType, ...inputWithoutNotifyType } = createInput();
  await handlers.create_etf_trade_alert(inputWithoutNotifyType);

  assert.equal(createdInput?.notifyType, "feishu");
});

test("toMCPTextResult serializes undefined backend data as null text", () => {
  assert.deepEqual(toMCPTextResult(undefined), {
    content: [
      {
        type: "text",
        text: "null",
      },
    ],
  });
});
