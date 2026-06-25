import assert from "node:assert/strict";
import test from "node:test";

import { ETFAlertBackendClient } from "./backend-client.js";
import type { ETFAlertInput } from "./types.js";

// createInput 生成一份符合后端校验规则的 ETF 交易提醒测试输入。
function createInput(): ETFAlertInput {
  return {
    etfCode: "510300",
    etfName: "沪深300ETF",
    actionType: "sell",
    shares: 500,
    conditionType: "price_gte",
    triggerPrice: 4.1,
    notifyType: "feishu",
    email: "",
    messageTemplate: "",
    enabled: true,
    state: "active",
    cooldownMinutes: 30,
  };
}

test("backend client maps tools to MCP ETF endpoints and sends API key header", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  // fetcher 记录后端请求，避免测试依赖真实 Go API 服务。
  const fetcher = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init: init ?? {} });
    return Response.json({ code: 200, message: "success", data: { ok: true } });
  };
  const client = new ETFAlertBackendClient({
    backendBaseURL: "http://api.example.test",
    apiKey: "secret-key",
    fetcher,
  });

  await client.list(2, 10);
  await client.get("1001");
  await client.create(createInput());
  await client.update("1001", createInput());
  await client.delete("1001");

  assert.deepEqual(
    calls.map((call) => `${call.init.method} ${call.url}`),
    [
      "POST http://api.example.test/mcp/etfTradeAlert/page/2/10",
      "GET http://api.example.test/mcp/etfTradeAlert/get/1001",
      "POST http://api.example.test/mcp/etfTradeAlert/add",
      "POST http://api.example.test/mcp/etfTradeAlert/update/1001",
      "POST http://api.example.test/mcp/etfTradeAlert/del/1001",
    ],
  );
  for (const call of calls) {
    assert.equal((call.init.headers as Record<string, string>)["X-MCP-API-Key"], "secret-key");
  }
});

test("backend client surfaces backend validation errors", async () => {
  const client = new ETFAlertBackendClient({
    backendBaseURL: "http://api.example.test",
    apiKey: "secret-key",
    fetcher: async () => Response.json({ code: 500, message: "ETF 代码格式错误", data: null }),
  });

  await assert.rejects(() => client.create(createInput()), /ETF 代码格式错误/);
});
