import test from "node:test";
import assert from "node:assert/strict";
import { clamp, getDefaultMemberOpenId, getAgentMemberMap, getAgentAppMap, normalizePageInput, parseTimeoutMs, resolveDefaultMemberForAgent, resolveAppConfigForAgent } from "../src/config.js";
test("clamp limits numeric range", () => {
    assert.equal(clamp(0, 1, 10), 1);
    assert.equal(clamp(11, 1, 10), 10);
    assert.equal(clamp(5, 1, 10), 5);
});
test("normalizePageInput applies defaults and trims page token", () => {
    assert.deepEqual(normalizePageInput(undefined, "  abc  "), {
        pageSize: 50,
        pageToken: "abc"
    });
    assert.deepEqual(normalizePageInput(999, ""), {
        pageSize: 100,
        pageToken: undefined
    });
});
test("parseTimeoutMs clamps timeout seconds", () => {
    assert.equal(parseTimeoutMs(0), 1_000);
    assert.equal(parseTimeoutMs(200), 120_000);
    assert.equal(parseTimeoutMs(30), 30_000);
});
test("getDefaultMemberOpenId reads FEISHU_DEFAULT_MEMBER_OPEN_ID", () => {
    const old = process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID;
    process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID = "  ou_default  ";
    assert.equal(getDefaultMemberOpenId(), "ou_default");
    process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID = old;
});
test("getAgentMemberMap returns empty object when env is unset", () => {
    const old = process.env.FEISHU_AGENT_MEMBER_MAP;
    delete process.env.FEISHU_AGENT_MEMBER_MAP;
    assert.deepEqual(getAgentMemberMap(), {});
    process.env.FEISHU_AGENT_MEMBER_MAP = old;
});
test("getAgentMemberMap parses valid JSON and filters invalid values", () => {
    const old = process.env.FEISHU_AGENT_MEMBER_MAP;
    process.env.FEISHU_AGENT_MEMBER_MAP = JSON.stringify({
        main: "ou_main",
        coder: "ou_coder",
        invalid: 123,
        empty: "  "
    });
    assert.deepEqual(getAgentMemberMap(), {
        main: "ou_main",
        coder: "ou_coder"
    });
    process.env.FEISHU_AGENT_MEMBER_MAP = old;
});
test("getAgentMemberMap returns empty object for invalid JSON", () => {
    const old = process.env.FEISHU_AGENT_MEMBER_MAP;
    process.env.FEISHU_AGENT_MEMBER_MAP = "not json";
    assert.deepEqual(getAgentMemberMap(), {});
    process.env.FEISHU_AGENT_MEMBER_MAP = old;
});
test("resolveDefaultMemberForAgent returns mapped openid when agent_id matches", () => {
    const oldMap = process.env.FEISHU_AGENT_MEMBER_MAP;
    const oldDefault = process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID;
    process.env.FEISHU_AGENT_MEMBER_MAP = JSON.stringify({ main: "ou_main", coder: "ou_coder" });
    process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID = "ou_fallback";
    assert.equal(resolveDefaultMemberForAgent("main"), "ou_main");
    assert.equal(resolveDefaultMemberForAgent("coder"), "ou_coder");
    process.env.FEISHU_AGENT_MEMBER_MAP = oldMap;
    process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID = oldDefault;
});
test("resolveDefaultMemberForAgent falls back to global default when agent_id missing or unmatched", () => {
    const oldMap = process.env.FEISHU_AGENT_MEMBER_MAP;
    const oldDefault = process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID;
    process.env.FEISHU_AGENT_MEMBER_MAP = JSON.stringify({ main: "ou_main" });
    process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID = "ou_fallback";
    assert.equal(resolveDefaultMemberForAgent("unknown"), "ou_fallback");
    assert.equal(resolveDefaultMemberForAgent(undefined), "ou_fallback");
    process.env.FEISHU_AGENT_MEMBER_MAP = oldMap;
    process.env.FEISHU_DEFAULT_MEMBER_OPEN_ID = oldDefault;
});
test("getAgentAppMap returns empty object when env is unset", () => {
    const old = process.env.FEISHU_AGENT_APP_MAP;
    delete process.env.FEISHU_AGENT_APP_MAP;
    assert.deepEqual(getAgentAppMap(), {});
    process.env.FEISHU_AGENT_APP_MAP = old;
});
test("getAgentAppMap parses valid JSON and filters invalid values", () => {
    const old = process.env.FEISHU_AGENT_APP_MAP;
    process.env.FEISHU_AGENT_APP_MAP = JSON.stringify({
        main: { app_id: "cli_main", app_secret: "sec_main" },
        coder: { app_id: "cli_coder", app_secret: "sec_coder" },
        bad: { app_id: "", app_secret: "sec_bad" },
        missing: { app_id: "cli_missing" }
    });
    assert.deepEqual(getAgentAppMap(), {
        main: { appId: "cli_main", appSecret: "sec_main" },
        coder: { appId: "cli_coder", appSecret: "sec_coder" }
    });
    process.env.FEISHU_AGENT_APP_MAP = old;
});
test("getAgentAppMap returns empty object for invalid JSON", () => {
    const old = process.env.FEISHU_AGENT_APP_MAP;
    process.env.FEISHU_AGENT_APP_MAP = "not json";
    assert.deepEqual(getAgentAppMap(), {});
    process.env.FEISHU_AGENT_APP_MAP = old;
});
test("resolveAppConfigForAgent returns mapped credentials when agent_id matches", () => {
    const oldAppId = process.env.FEISHU_APP_ID;
    const oldAppSecret = process.env.FEISHU_APP_SECRET;
    const oldBaseURL = process.env.FEISHU_BASE_URL;
    const oldTimeout = process.env.FEISHU_TIMEOUT_SECONDS;
    const oldMap = process.env.FEISHU_AGENT_APP_MAP;
    process.env.FEISHU_APP_ID = "cli_default";
    process.env.FEISHU_APP_SECRET = "sec_default";
    process.env.FEISHU_BASE_URL = "https://open.feishu.cn";
    process.env.FEISHU_TIMEOUT_SECONDS = "30";
    process.env.FEISHU_AGENT_APP_MAP = JSON.stringify({
        coder: { app_id: "cli_coder", app_secret: "sec_coder" }
    });
    const coderConfig = resolveAppConfigForAgent("coder");
    assert.equal(coderConfig.appId, "cli_coder");
    assert.equal(coderConfig.appSecret, "sec_coder");
    assert.equal(coderConfig.baseURL, "https://open.feishu.cn");
    assert.equal(coderConfig.timeoutMs, 30_000);
    process.env.FEISHU_APP_ID = oldAppId;
    process.env.FEISHU_APP_SECRET = oldAppSecret;
    process.env.FEISHU_BASE_URL = oldBaseURL;
    process.env.FEISHU_TIMEOUT_SECONDS = oldTimeout;
    process.env.FEISHU_AGENT_APP_MAP = oldMap;
});
test("resolveAppConfigForAgent falls back to global config when agent_id missing or unmatched", () => {
    const oldAppId = process.env.FEISHU_APP_ID;
    const oldAppSecret = process.env.FEISHU_APP_SECRET;
    const oldMap = process.env.FEISHU_AGENT_APP_MAP;
    process.env.FEISHU_APP_ID = "cli_default";
    process.env.FEISHU_APP_SECRET = "sec_default";
    process.env.FEISHU_AGENT_APP_MAP = JSON.stringify({
        coder: { app_id: "cli_coder", app_secret: "sec_coder" }
    });
    const unknownConfig = resolveAppConfigForAgent("unknown");
    assert.equal(unknownConfig.appId, "cli_default");
    assert.equal(unknownConfig.appSecret, "sec_default");
    const defaultConfig = resolveAppConfigForAgent(undefined);
    assert.equal(defaultConfig.appId, "cli_default");
    assert.equal(defaultConfig.appSecret, "sec_default");
    process.env.FEISHU_APP_ID = oldAppId;
    process.env.FEISHU_APP_SECRET = oldAppSecret;
    process.env.FEISHU_AGENT_APP_MAP = oldMap;
});
