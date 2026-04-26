# 推送到华为手机 MCP

一个个人使用的“推送到华为手机”MCP 服务。

## 功能

- `push_to_huawei_phone`
  - 使用华为手机推送协议（`authCode` 从环境变量读取）
  - tool 仅需传 `scheduleTaskName` 和 `content`，其余协议字段由服务端自动生成
  - 自动添加 `x-trace-id` 请求头
  - 业务成功以响应 `code` 判定（`0000000000`/`0` 才算成功）
- `get_push_history`
  - 查询本地推送记录，用于排障和审计

## 环境变量

- `HUAWEI_PUSH_AUTH_CODE`（必填）：推送鉴权码
- `HUAWEI_PUSH_URL`（可选）：推送服务 URL，默认 `https://hiboard-claw-drcn.ai.dbankcloud.cn/distribution/message/cloud/claw/msg/upload`
- `HUAWEI_PUSH_TIMEOUT_SEC`（可选）：请求超时秒数，默认 `15`
- `HUAWEI_PUSH_SAVE_RECORDS`（可选）：是否本地保存推送记录，默认 `true`
- `HUAWEI_PUSH_RECORDS_LIMIT`（可选）：本地最多保留记录数，默认 `100`
- `HUAWEI_PUSH_RECORDS_DIR`（可选）：记录目录，默认 `~/.huawei-phone-push-mcp`
- `HUAWEI_PUSH_RECORDS_FILE`（可选）：记录文件名，默认 `push-records.json`

## 本地运行

```bash
cd /Users/zhangjianyong/project/z-mcp/huawei-phone-push-mcp
npm install
npm run check
npm test
npm run dev
```

## MCP 配置示例

```json
{
  "mcpServers": {
    "huawei-phone-push": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/huawei-phone-push-mcp/dist/index.js"],
      "env": {
        "HUAWEI_PUSH_AUTH_CODE": "your-auth-code"
      }
    }
  }
}
```

## tool 输入示例

```json
{
  "scheduleTaskName": "日报生成",
  "content": "# 日报\n\n任务执行完成。"
}
```
