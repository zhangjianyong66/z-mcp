import test from "node:test";
import assert from "node:assert/strict";
import { FeishuApiError, FeishuClient } from "../src/client.js";

type FetchCall = {
  url: string;
  init?: RequestInit;
};

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

test("FeishuClient caches tenant token between tool requests", async () => {
  const calls: FetchCall[] = [];

  const fetcher = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, init });

    if (url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
      return makeJsonResponse({
        code: 0,
        tenant_access_token: "token-1",
        expire: 7200
      });
    }

    if (url.includes("/open-apis/im/v1/chats?page_size=10")) {
      return makeJsonResponse({
        code: 0,
        data: {
          items: []
        }
      });
    }

    return makeJsonResponse({ code: 404, msg: "not found" }, 404);
  };

  const client = new FeishuClient({
    appId: "cli_test",
    appSecret: "secret_test",
    baseURL: "https://open.feishu.cn",
    timeoutMs: 10_000,
    fetcher
  });

  await client.listChats({ pageSize: 10 });
  await client.listChats({ pageSize: 10 });

  const tokenCalls = calls.filter((call) => call.url.endsWith("/open-apis/auth/v3/tenant_access_token/internal"));
  assert.equal(tokenCalls.length, 1);
});

test("FeishuClient throws FeishuApiError when response code is non-zero", async () => {
  const fetcher = async (input: string | URL): Promise<Response> => {
    const url = String(input);

    if (url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
      return makeJsonResponse({
        code: 0,
        tenant_access_token: "token-2",
        expire: 7200
      });
    }

    return makeJsonResponse({
      code: 99991663,
      msg: "no permissions"
    });
  };

  const client = new FeishuClient({
    appId: "cli_test",
    appSecret: "secret_test",
    baseURL: "https://open.feishu.cn",
    timeoutMs: 10_000,
    fetcher
  });

  await assert.rejects(
    () => client.getChat("oc_test"),
    (error: unknown) => {
      assert.ok(error instanceof FeishuApiError);
      assert.equal(error.code, 99991663);
      return true;
    }
  );
});
