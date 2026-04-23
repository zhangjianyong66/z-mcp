import { normalizePageInput } from "./config.js";
import { getFeishuClient } from "./client.js";
function getClient(agentId) {
    return getFeishuClient(agentId);
}
function buildResult(tool, data) {
    return {
        code: 0,
        data,
        request_meta: {
            tool,
            generated_at: new Date().toISOString()
        }
    };
}
function normalizeChatId(chatId) {
    const value = chatId.trim();
    if (!value) {
        throw new Error("chat_id cannot be empty");
    }
    return value;
}
function normalizeUserIds(userIds) {
    const normalized = userIds.map((item) => item.trim()).filter(Boolean);
    if (normalized.length === 0) {
        throw new Error("user_ids cannot be empty");
    }
    return [...new Set(normalized)];
}
export async function runCreateChat(input) {
    const name = input.name.trim();
    if (!name) {
        throw new Error("name cannot be empty");
    }
    const agentId = input.agent_id.trim();
    if (!agentId) {
        throw new Error("agent_id is required");
    }
    const userOpenId = input.user_open_id.trim();
    if (!userOpenId) {
        throw new Error("user_open_id is required");
    }
    const description = input.description?.trim() || undefined;
    const explicitUserIds = input.user_id_list ? normalizeUserIds(input.user_id_list) : [];
    const allUserIds = [...explicitUserIds, userOpenId];
    const mergedUserIds = normalizeUserIds(allUserIds);
    const userIds = mergedUserIds.length > 0 ? mergedUserIds : undefined;
    const response = await getClient(agentId).createChat({
        name,
        description,
        chat_mode: "group",
        chat_type: "private",
        user_id_list: userIds
    }, input.timeout);
    return buildResult("create_chat", response.data ?? {});
}
export async function runRenameChat(input) {
    const chatId = normalizeChatId(input.chat_id);
    const newName = input.new_name.trim();
    if (!newName) {
        throw new Error("new_name cannot be empty");
    }
    const response = await getClient().renameChat(chatId, { name: newName }, input.timeout);
    return buildResult("rename_chat", response.data ?? {});
}
export async function runDeleteChat(input) {
    const chatId = normalizeChatId(input.chat_id);
    const response = await getClient().deleteChat(chatId, input.timeout);
    return buildResult("delete_chat", response.data ?? {});
}
export async function runAddChatMembers(input) {
    const chatId = normalizeChatId(input.chat_id);
    const userIds = normalizeUserIds(input.user_ids);
    const response = await getClient().addMembers(chatId, {
        id_list: userIds,
        member_type: "user"
    }, input.timeout);
    return buildResult("add_chat_members", response.data ?? {});
}
export async function runRemoveChatMembers(input) {
    const chatId = normalizeChatId(input.chat_id);
    const userIds = normalizeUserIds(input.user_ids);
    const response = await getClient().removeMembers(chatId, {
        id_list: userIds,
        member_type: "user"
    }, input.timeout);
    return buildResult("remove_chat_members", response.data ?? {});
}
export async function runListChats(input) {
    const page = normalizePageInput(input.page_size, input.page_token);
    const response = await getClient().listChats(page, input.timeout);
    return buildResult("list_chats", {
        items: response.data?.items ?? [],
        page_token: response.data?.page_token,
        has_more: response.data?.has_more ?? false,
        page_size: page.pageSize
    });
}
export async function runGetChat(input) {
    const chatId = normalizeChatId(input.chat_id);
    const response = await getClient().getChat(chatId, input.timeout);
    return buildResult("get_chat", response.data ?? {});
}
export async function runListChatMembers(input) {
    const chatId = normalizeChatId(input.chat_id);
    const page = normalizePageInput(input.page_size, input.page_token);
    const response = await getClient().listMembers(chatId, page, input.timeout);
    return buildResult("list_chat_members", {
        items: response.data?.items ?? [],
        page_token: response.data?.page_token,
        has_more: response.data?.has_more ?? false,
        page_size: page.pageSize
    });
}
