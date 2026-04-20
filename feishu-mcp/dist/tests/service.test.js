import test from "node:test";
import assert from "node:assert/strict";
function makeJsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json"
        }
    });
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
            user_id_list: ["ou_user_1", "ou_default", "ou_user_1"]
        });
        const userIdList = capturedCreateBody?.user_id_list;
        assert.ok(Array.isArray(userIdList));
        assert.deepEqual(userIdList, ["ou_user_1", "ou_default"]);
    }
    finally {
        globalThis.fetch = oldFetch;
        process.env.FEISHU_APP_ID = oldAppId;
        process.env.FEISHU_APP_SECRET = oldAppSecret;
        process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID = oldDefault;
    }
});
