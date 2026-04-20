# z-mcp feishu server

飞书群聊管理 MCP server。

## 功能

- `create_chat`: 创建群聊
- `rename_chat`: 修改群名
- `delete_chat`: 解散群聊
- `add_chat_members`: 添加成员
- `remove_chat_members`: 移除成员
- `list_chats`: 获取群聊列表（支持分页）
- `get_chat`: 获取群详情
- `list_chat_members`: 获取群成员（支持分页）

## 环境变量

必填：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`

可选：

- `FEISHU_BASE_URL`，默认 `https://open.feishu.cn`
- `FEISHU_TIMEOUT_SECONDS`，默认 `30`
- `FEISHU_DEFAULT_MEMBER_OPEN_ID`，创建群聊时默认自动加入的用户 `open_id`

## 安装

```bash
npm install
```

## 开发

```bash
npm run dev
```

## 构建

```bash
npm run build
```

## MCP 配置示例

```json
{
  "mcpServers": {
    "feishu": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/feishu-mcp/dist/index.js"],
      "env": {
        "FEISHU_APP_ID": "cli_xxxxxxxxxxxxxxxx",
        "FEISHU_APP_SECRET": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "FEISHU_BASE_URL": "https://open.feishu.cn",
        "FEISHU_TIMEOUT_SECONDS": "30"
      }
    }
  }
}
```

## 输出格式

所有 tools 成功时返回结构化 JSON：

```json
{
  "code": 0,
  "data": {},
  "request_meta": {
    "tool": "list_chats",
    "generated_at": "2026-04-19T12:00:00.000Z"
  }
}
```

失败时返回 MCP `isError=true`，文本内容里包含详细错误信息（HTTP status、飞书 code/msg、响应体）。

## 建群默认拉人

若配置 `FEISHU_DEFAULT_MEMBER_OPEN_ID`，调用 `create_chat` 时会自动将该 `open_id` 合并进 `user_id_list`（自动去重）。
