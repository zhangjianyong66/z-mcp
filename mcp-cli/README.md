# z-mcp cli

一个轻量的 MCP 调试 CLI，用来连接并检查本仓库内的 stdio MCP server。

## 功能

- `inspect`
  - 查看 server 基本信息、capabilities 和 instructions
- `list-tools`
  - 列出 server 暴露的 tools
- `call-tool`
  - 调用指定 tool，并输出 MCP 原始返回结果

## 用法

```bash
npm run dev -- inspect image
npm run dev -- list-tools video
npm run dev -- list-tools search
npm run dev -- call-tool stock-data etf_quote --input '{"symbol":"159930"}'
HUAWEI_PUSH_AUTH_CODE=your-auth-code npm run dev -- list-tools huawei-phone-push --mode dist
```

## 默认 server

- `image` -> `../image-mcp`
- `video` -> `../video-mcp`
- `search` -> `../search-mcp`
- `stock-data` -> `../stock-data-mcp`
- `huawei-phone-push` -> `../huawei-phone-push-mcp`

## 启动模式

- `dev`：`node --import tsx src/index.ts`
- `dist`：`node dist/index.js`

默认使用 `dev` 模式，便于直接测试源码。
