import test from "node:test";
import assert from "node:assert/strict";
import { clearClientCache } from "../src/client.js";
function makeJsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json"
        }
    });
}
function restoreEnv(name, oldValue) {
    if (oldValue === undefined) {
        delete process.env[name];
    }
    else {
        process.env[name] = oldValue;
    }
}
test("runCreateChat appends configured default member and deduplicates", async () => {
    const oldFetch = globalThis.fetch;
    const oldAppId = process.env.FEISHU_APP_ID;
    const oldAppSecret = process.env.FEISHU_APP_SECRET;
    const oldDefault = process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID;
    let capturedCreateBody;
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
            return makeJsonResponse({
                code: 0,
                tenant_access_token: "token-test",
                expire: 7200
            });
        }
        if (url.endsWith("/open-apis/im/v1/chats")) {
            capturedCreateBody = init?.body ? JSON.parse(String(init.body)) : {};
            return makeJsonResponse({
                code: 0,
                data: {
                    chat_id: "oc_test"
                }
            });
        }
        return makeJsonResponse({ code: 404, msg: "not found" }, 404);
    };
    process.env.FEISHU_APP_ID = "cli_test";
    process.env.FEISHU_APP_SECRET = "secret_test";
    process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID = "ou_default";
    try {
        const { runCreateChat } = await import("../src/service.js");
        await runCreateChat({
            name: "test-group",
            user_id_list: ["ou_user_1", "ou_default", "ou_user_1"],
            user_open_id: "ou_me",
            agent_id: "main"
        });
        const userIdList = capturedCreateBody?.user_id_list;
        assert.ok(Array.isArray(userIdList));
        assert.deepEqual(userIdList, ["ou_user_1", "ou_default", "ou_me"]);
    }
    finally {
        globalThis.fetch = oldFetch;
        restoreEnv("FEISHU_APP_ID", oldAppId);
        restoreEnv("FEISHU_APP_SECRET", oldAppSecret);
        restoreEnv("FEISHU_DEFAULT_MEMBER_OPEN_ID", oldDefault);
        clearClientCache();
    }
});
test("runCreateChat only uses user_open_id and user_id_list, ignores default member config", async () => {
    const oldFetch = globalThis.fetch;
    const oldAppId = process.env.FEISHU_APP_ID;
    const oldAppSecret = process.env.FEISHU_APP_SECRET;
    const oldDefault = process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID;
    const oldMap = process.env.FEISHU_AGENT_MEMBER_MAP;
    let capturedCreateBody;
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
            return makeJsonResponse({
                code: 0,
                tenant_access_token: "token-test",
                expire: 7200
            });
        }
        if (url.endsWith("/open-apis/im/v1/chats")) {
            capturedCreateBody = init?.body ? JSON.parse(String(init.body)) : {};
            return makeJsonResponse({
                code: 0,
                data: {
                    chat_id: "oc_test"
                }
            });
        }
        return makeJsonResponse({ code: 404, msg: "not found" }, 404);
    };
    process.env.FEISHU_APP_ID = "cli_test";
    process.env.FEISHU_APP_SECRET = "secret_test";
    process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID = "ou_fallback";
    process.env.FEISHU_AGENT_MEMBER_MAP = JSON.stringify({ main: "ou_main", coder: "ou_coder" });
    try {
        const { runCreateChat } = await import("../src/service.js");
        await runCreateChat({
            name: "coder-group",
            user_open_id: "ou_me",
            agent_id: "coder"
        });
        const userIdList = capturedCreateBody?.user_id_list;
        assert.ok(Array.isArray(userIdList));
        assert.deepEqual(userIdList, ["ou_me"]);
    }
    finally {
        globalThis.fetch = oldFetch;
        restoreEnv("FEISHU_APP_ID", oldAppId);
        restoreEnv("FEISHU_APP_SECRET", oldAppSecret);
        restoreEnv("FEISHU_DEFAULT_MEMBER_OPEN_ID", oldDefault);
        restoreEnv("FEISHU_AGENT_MEMBER_MAP", oldMap);
        clearClientCache();
    }
});
test("runCreateChat merges user_open_id into member list", async () => {
    const oldFetch = globalThis.fetch;
    const oldAppId = process.env.FEISHU_APP_ID;
    const oldAppSecret = process.env.FEISHU_APP_SECRET;
    let capturedCreateBody;
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
            return makeJsonResponse({
                code: 0,
                tenant_access_token: "token-test",
                expire: 7200
            });
        }
        if (url.endsWith("/open-apis/im/v1/chats")) {
            capturedCreateBody = init?.body ? JSON.parse(String(init.body)) : {};
            return makeJsonResponse({
                code: 0,
                data: { chat_id: "oc_test" }
            });
        }
        return makeJsonResponse({ code: 404, msg: "not found" }, 404);
    };
    process.env.FEISHU_APP_ID = "cli_test";
    process.env.FEISHU_APP_SECRET = "secret_test";
    try {
        const { runCreateChat } = await import("../src/service.js");
        await runCreateChat({
            name: "test-group",
            user_open_id: "ou_me",
            agent_id: "main"
        });
        const userIdList = capturedCreateBody?.user_id_list;
        assert.ok(Array.isArray(userIdList));
        assert.deepEqual(userIdList, ["ou_me"]);
    }
    finally {
        globalThis.fetch = oldFetch;
        restoreEnv("FEISHU_APP_ID", oldAppId);
        restoreEnv("FEISHU_APP_SECRET", oldAppSecret);
        clearClientCache();
    }
});
test("runCreateChat deduplicates user_id_list + user_open_id + default member", async () => {
    const oldFetch = globalThis.fetch;
    const oldAppId = process.env.FEISHU_APP_ID;
    const oldAppSecret = process.env.FEISHU_APP_SECRET;
    const oldDefault = process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID;
    let capturedCreateBody;
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
            return makeJsonResponse({
                code: 0,
                tenant_access_token: "token-test",
                expire: 7200
            });
        }
        if (url.endsWith("/open-apis/im/v1/chats")) {
            capturedCreateBody = init?.body ? JSON.parse(String(init.body)) : {};
            return makeJsonResponse({
                code: 0,
                data: { chat_id: "oc_test" }
            });
        }
        return makeJsonResponse({ code: 404, msg: "not found" }, 404);
    };
    process.env.FEISHU_APP_ID = "cli_test";
    process.env.FEISHU_APP_SECRET = "secret_test";
    process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID = "ou_default";
    try {
        const { runCreateChat } = await import("../src/service.js");
        await runCreateChat({
            name: "test-group",
            user_id_list: ["ou_friend", "ou_default"],
            user_open_id: "ou_me",
            agent_id: "main"
        });
        const userIdList = capturedCreateBody?.user_id_list;
        assert.ok(Array.isArray(userIdList));
        assert.equal(userIdList.length, 3);
        assert.ok(userIdList.includes("ou_friend"));
        assert.ok(userIdList.includes("ou_me"));
        assert.ok(userIdList.includes("ou_default"));
    }
    finally {
        globalThis.fetch = oldFetch;
        restoreEnv("FEISHU_APP_ID", oldAppId);
        restoreEnv("FEISHU_APP_SECRET", oldAppSecret);
        restoreEnv("FEISHU_DEFAULT_MEMBER_OPEN_ID", oldDefault);
        clearClientCache();
    }
});
test("runCreateChat uses agent-specific app credentials from FEISHU_AGENT_APP_MAP", async () => {
    const oldFetch = globalThis.fetch;
    const oldAppId = process.env.FEISHU_APP_ID;
    const oldAppSecret = process.env.FEISHU_APP_SECRET;
    const oldMap = process.env.FEISHU_AGENT_APP_MAP;
    let capturedTokenBody;
    let capturedCreateBody;
    globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
            capturedTokenBody = init?.body ? JSON.parse(String(init.body)) : {};
            return makeJsonResponse({
                code: 0,
                tenant_access_token: "token-coder",
                expire: 7200
            });
        }
        if (url.endsWith("/open-apis/im/v1/chats")) {
            capturedCreateBody = init?.body ? JSON.parse(String(init.body)) : {};
            return makeJsonResponse({
                code: 0,
                data: { chat_id: "oc_coder" }
            });
        }
        return makeJsonResponse({ code: 404, msg: "not found" }, 404);
    };
    process.env.FEISHU_APP_ID = "cli_default";
    process.env.FEISHU_APP_SECRET = "sec_default";
    delete process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID;
    delete process.env.FEISHU_AGENT_MEMBER_MAP;
    process.env.FEISHU_AGENT_APP_MAP = JSON.stringify({
        coder_exclusive: { app_id: "cli_coder", app_secret: "sec_coder" }
    });
    try {
        const { runCreateChat } = await import("../src/service.js");
        await runCreateChat({
            name: "coder-exclusive",
            agent_id: "coder_exclusive",
            user_open_id: "ou_coder"
        });
        assert.equal(capturedTokenBody?.app_id, "cli_coder");
        assert.equal(capturedTokenBody?.app_secret, "sec_coder");
        assert.deepEqual(capturedCreateBody?.user_id_list, ["ou_coder"]);
    }
    finally {
        globalThis.fetch = oldFetch;
        restoreEnv("FEISHU_APP_ID", oldAppId);
        restoreEnv("FEISHU_APP_SECRET", oldAppSecret);
        restoreEnv("FEISHU_AGENT_APP_MAP", oldMap);
        restoreEnv("FEISHU_DEFAULT_MEMBER_OPEN_ID", undefined);
        restoreEnv("FEISHU_AGENT_MEMBER_MAP", undefined);
        clearClientCache();
    }
});
