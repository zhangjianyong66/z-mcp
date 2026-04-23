import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FeishuApiError } from "./client.js";
import {
  runAddChatMembers,
  runCreateChat,
  runDeleteChat,
  runGetChat,
  runListChatMembers,
  runListChats,
  runRemoveChatMembers,
  runRenameChat
} from "./service.js";

function toToolError(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  if (error instanceof FeishuApiError) {
    const details = {
      message: error.message,
      status: error.status,
      code: error.code,
      response: error.responseBody
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(details, null, 2)
        }
      ],
      isError: true
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text",
        text: message
      }
    ],
    isError: true
  };
}

const server = new McpServer({
  name: "feishu-mcp",
  version: "0.1.0"
});

server.tool(
  "create_chat",
  "创建飞书群聊。agent_id 用于匹配应用（FEISHU_AGENT_APP_MAP）和默认成员（FEISHU_AGENT_MEMBER_MAP）。user_open_id 是当前用户的 open_id，Agent 应从会话数据中解析后传入。",
  {
    name: z.string().min(1).describe("Chat name."),
    description: z.string().optional().describe("Optional chat description."),
    user_id_list: z.array(z.string().min(1)).optional().describe("Optional open_id list of other users to add."),
    user_open_id: z.string().min(1).describe("Current user's open_id for this agent's Feishu app. Agent must pass its own user's open_id parsed from session data."),
    agent_id: z.string().min(1).describe("Required agent identifier (e.g. main, coder, squirrel, pencil). Used to look up app credentials from FEISHU_AGENT_APP_MAP and default member from FEISHU_AGENT_MEMBER_MAP."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds.")
  },
  async ({ name, description, user_id_list, user_open_id, agent_id, timeout }) => {
    try {
      const result = await runCreateChat({ name, description, user_id_list, user_open_id, agent_id, timeout });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "rename_chat",
  "修改飞书群名称。",
  {
    chat_id: z.string().min(1).describe("Chat ID, starts with oc_."),
    new_name: z.string().min(1).describe("New chat name."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds.")
  },
  async ({ chat_id, new_name, timeout }) => {
    try {
      const result = await runRenameChat({ chat_id, new_name, timeout });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "delete_chat",
  "解散飞书群聊。",
  {
    chat_id: z.string().min(1).describe("Chat ID, starts with oc_."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds.")
  },
  async ({ chat_id, timeout }) => {
    try {
      const result = await runDeleteChat({ chat_id, timeout });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "add_chat_members",
  "向飞书群聊添加成员。",
  {
    chat_id: z.string().min(1).describe("Chat ID, starts with oc_."),
    user_ids: z.array(z.string().min(1)).min(1).describe("open_id list to add."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds.")
  },
  async ({ chat_id, user_ids, timeout }) => {
    try {
      const result = await runAddChatMembers({ chat_id, user_ids, timeout });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "remove_chat_members",
  "从飞书群聊移除成员。",
  {
    chat_id: z.string().min(1).describe("Chat ID, starts with oc_."),
    user_ids: z.array(z.string().min(1)).min(1).describe("open_id list to remove."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds.")
  },
  async ({ chat_id, user_ids, timeout }) => {
    try {
      const result = await runRemoveChatMembers({ chat_id, user_ids, timeout });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "list_chats",
  "获取飞书群列表。",
  {
    page_size: z.number().int().min(1).max(100).optional().describe("Optional page size. Defaults to 50."),
    page_token: z.string().optional().describe("Optional page token for next page."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds.")
  },
  async ({ page_size, page_token, timeout }) => {
    try {
      const result = await runListChats({ page_size, page_token, timeout });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "get_chat",
  "获取飞书群详情。",
  {
    chat_id: z.string().min(1).describe("Chat ID, starts with oc_."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds.")
  },
  async ({ chat_id, timeout }) => {
    try {
      const result = await runGetChat({ chat_id, timeout });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "list_chat_members",
  "获取飞书群成员列表。",
  {
    chat_id: z.string().min(1).describe("Chat ID, starts with oc_."),
    page_size: z.number().int().min(1).max(100).optional().describe("Optional page size. Defaults to 50."),
    page_token: z.string().optional().describe("Optional page token for next page."),
    timeout: z.number().int().min(1).max(120).optional().describe("Optional timeout in seconds.")
  },
  async ({ chat_id, page_size, page_token, timeout }) => {
    try {
      const result = await runListChatMembers({ chat_id, page_size, page_token, timeout });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
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
