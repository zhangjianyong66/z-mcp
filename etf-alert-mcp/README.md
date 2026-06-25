# ETF 交易提醒 MCP

本目录维护从 Z-Tools 迁入的 ETF 交易提醒 MCP。它通过 Go 后端 `/mcp/etfTradeAlert/...` 接口管理提醒，不直接连接 MySQL。

典型场景是 Agent 分析市场行情后调用 `create_etf_trade_alert` 写入到价交易提醒；后续行情轮询、价格条件判断和通知触发由 Z-Tools Go 后端定时任务完成。Agent 未传 `notifyType` 时，本 MCP 默认使用飞书通知。

## 配置

复制 `.env.example` 中的变量到 MCP 客户端或本地运行环境：

- `ETF_ALERT_MCP_BACKEND_BASE_URL`：Go 后端地址，默认可用 `http://localhost:8082`
- `ETF_ALERT_MCP_API_KEY`：后端 `GO_API_MCP_API_KEY` 对应的密钥

后端还需要配置：

- `GO_API_MCP_API_KEY`：MCP 专用 API Key
- `GO_API_MCP_USER_ID`：MCP 工具管理 ETF 提醒时绑定的用户 ID

## 命令

```bash
npm install
npm test
npm run build
node dist/index.js
```

## MCP 客户端示例

```json
{
  "mcpServers": {
    "z-tools-etf-alert-mcp": {
      "command": "node",
      "args": ["/home/zhangjianyong/project/z-mcp/etf-alert-mcp/dist/index.js"],
      "env": {
        "ETF_ALERT_MCP_BACKEND_BASE_URL": "http://localhost:8082",
        "ETF_ALERT_MCP_API_KEY": "replace-with-backend-go-api-mcp-key"
      }
    }
  }
}
```

## 工具

- `list_etf_trade_alerts`：分页查看 ETF 交易提醒
- `get_etf_trade_alert`：按 ID 查看 ETF 交易提醒
- `create_etf_trade_alert`：新增 ETF 交易提醒
- `update_etf_trade_alert`：修改 ETF 交易提醒
- `delete_etf_trade_alert`：物理删除 ETF 交易提醒

`create_etf_trade_alert` / `update_etf_trade_alert` 的 `notifyType` 可传 `email` 或 `feishu`；省略时 MCP 会默认传 `feishu` 给后端。

`update_etf_trade_alert` 如未传 `enabled`，MCP 会先读取当前提醒并沿用现有启停状态，避免后端布尔零值把提醒误置为停用；后端更新成功但返回空数据时，MCP 会自动重新查询详情并返回确认结果。`delete_etf_trade_alert` 删除成功但后端返回空数据时，MCP 会返回包含 `success`、`operation` 和 `id` 的确认对象。

真实 API Key 只能放在本地环境或 MCP 客户端配置中，不要提交到仓库。
