# 项目协作说明

- 默认使用中文沟通、制定计划和记录方案；除非用户明确要求英文。
- git commit message 使用中文描述。
- 大型任务通过设计文档、计划文件、checkbox、测试结果和 git commit 保持连续性，不依赖聊天历史。
- 执行大型计划时，默认只执行用户指定的 milestone 或任务范围；不要在未确认的情况下连续推进整个大型计划。

## stock-data-mcp

- 目录：`stock-data-mcp/`
- 技术栈：Node.js ESM + TypeScript，MCP SDK，`mysql2/promise`，Playwright，Python AkShare。
- 常用命令：
  - `npm run check`：TypeScript 类型检查。
  - `npm run build`：构建到 `dist/`。
  - `npm test`：运行 Node 测试。
  - `npm run dev`：以 `tsx src/index.ts` 启动开发服务。
- MySQL 配置环境变量：
  - `DB_HOST` 默认 `mysql.zhangjianyong.top`
  - `DB_PORT` 默认 `3306`
  - 初始化脚本使用 `DB_NAME=stock_data`
  - 初始化脚本使用 `DB_USER=stock_data_app`
  - `DB_PASS` 必填
- 数据库初始化脚本：`stock-data-mcp/docs/mysql-init.sql`。
- 当前代码依赖的数据表：
  - `etf_universe`：ETF 标的池，供 `etf_universe` 和 `etf_batch_decide` 读取 `symbol/name/theme`。
  - `etf_portfolios`：最新持仓快照主表。
  - `etf_positions`：持仓明细，关联 `etf_portfolios.id`。
  - `etf_orders`：交易单/挂单，支持 `pending/filled/cancelled/expired` 状态。
  - `sector_hot_latest`：`sector_list` 每次调用后刷新的热门行业快照；代码会自动创建该表，但初始化脚本也包含完整定义。
- `sector_list` 依赖本机 `python3` 和 `akshare` 包，可通过 `AKSHARE_PYTHON_BIN` 指定虚拟环境解释器。
- `xueqiu` 数据源优先使用 `XUEQIU_COOKIE`；未配置时会尝试 Playwright 自动获取 Cookie。

## etf-alert-mcp

- 目录：`etf-alert-mcp/`
- 来源：从 Z-Tools 迁入并统一为 `etf-alert-mcp` 命名；仍通过 Z-Tools 后端 `/mcp/etfTradeAlert/...` 接口管理 ETF 交易提醒。
- 技术栈：Node.js ESM + TypeScript，MCP SDK，`fetch` 调后端 API。
- 常用命令：
  - `npm install`：安装依赖。
  - `npm test`：运行 Node 测试。
  - `npm run build`：构建到 `dist/`。
  - `node dist/index.js`：启动 stdio MCP Server。
- 环境变量：
  - `ETF_ALERT_MCP_BACKEND_BASE_URL` 默认 `http://localhost:8082`
  - `ETF_ALERT_MCP_API_KEY` 必填，对应后端 `GO_API_MCP_API_KEY`
- MCP 客户端配置时应指向 `/home/zhangjianyong/project/z-mcp/etf-alert-mcp/dist/index.js`。
- 该模块不直连 MySQL，只通过后端 MCP API 读写数据，用户归属由后端 `GO_API_MCP_USER_ID` 决定；Agent 创建提醒时如未传 `notifyType`，MCP 默认使用 `feishu`。
- `update_etf_trade_alert` 如未传 `enabled`，MCP 会先读取当前提醒并沿用现有启停状态，避免后端布尔零值把提醒误置为停用；后端更新成功但返回空数据时，MCP 会自动重新查询详情并返回确认结果。
- `delete_etf_trade_alert` 删除成功但后端返回空数据时，MCP 会返回包含 `success`、`operation` 和 `id` 的确认对象，而不是直接暴露 `null`。
- 到价检查和通知触发由 Z-Tools Go 后端定时任务负责：后端每分钟检查 active/enabled 的 ETF 交易提醒，读取东方财富行情，按 `price_lte` / `price_gte` 判断后发送邮箱或飞书通知，并维护最新价、检查时间、触发时间、触发次数和错误信息。

## mysql-mcp

- 目录：`mysql-mcp/`
- 技术栈：Node.js ESM + TypeScript，MCP SDK，`mysql2/promise`，Node built-in test runner。
- 常用命令：
  - `npm run check`：TypeScript 类型检查。
  - `npm test`：运行 Node 测试。
  - `npm run build`：构建到 `dist/`。
  - `npm run dev`：以 `tsx src/index.ts` 启动开发服务。
- 当前 `tsconfig` 的实际构建入口为 `mysql-mcp/dist/src/index.js`。
- Codex 全局配置中已添加 `mysql_littlebao` MCP server，指向 `/home/zhangjianyong/project/z-mcp/mysql-mcp/dist/src/index.js`；连接凭据保存在 `/home/zhangjianyong/.codex/config.toml`，不要写入项目文档。
- 一个 `mysql-mcp` server 实例只连接一个 MySQL 数据源；不支持 `MYSQL_DATASOURCES` 多数据源 JSON 配置。
- 如需同时使用多个 MySQL 数据源，应在 MCP 客户端配置多个 `mysql-mcp` server 条目，并分别设置不同环境变量。
- MySQL 配置环境变量：
  - `MYSQL_HOST` 必填
  - `MYSQL_PORT` 默认 `3306`
  - `MYSQL_USER` 必填
  - `MYSQL_PASSWORD` 默认空字符串
  - `MYSQL_DATABASE` 必填
  - `MYSQL_SSL` 默认 `false`
  - `MYSQL_QUERY_TIMEOUT_MS` 默认 `30000`
  - `MYSQL_MAX_ROWS` 默认 `500`，最大 `5000`
- 当前工具使用当前 server 实例绑定的数据源，不接收 `datasource` 参数；工具包括 `mysql_query`、`list_databases`、`list_tables`、`describe_table`。
- `list_datasources` 工具已移除。
- Codex CLI 已在 `~/.codex/config.toml` 配置独立 server `mysql-littlebao`，连接远程库 `littlebao`，账号 `littlebao_readonly` 仅授予 `littlebao.*` 的 `SELECT` 权限；密码只保存在 Codex 本机配置中，不写入项目说明。
- Codex CLI 的 MySQL MCP server 应使用单数据源环境变量配置，例如 `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`、`MYSQL_SSL`；不要再使用 `MYSQL_DATASOURCES`。
- Codex CLI 当前配置中 `mysql` 连接 `integra_serve`，`mysql-z-blog` 连接 `blog`，`mysql-littlebao` 连接 `littlebao`，三个 server 均指向 `mysql-mcp/dist/src/index.js`。

## image-mcp

- 目录：`image-mcp/`
- 技术栈：Node.js ESM + TypeScript，MCP SDK，DashScope 百炼多模态同步接口。
- 常用命令：
  - `npm run check`：TypeScript 类型检查。
  - `npm test`：运行 Node 测试。
  - `npm run build`：构建到 `dist/`。
  - `npm run dev`：以 `tsx src/index.ts` 启动开发服务。
- 工具包括 `generate_image`、`edit_image`、`analyze_image`。
- 生图/图生图使用 `DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL`、`DASHSCOPE_MODEL` 或 `IMAGE_MODEL_CHAIN` 配置。
- 图片理解 `analyze_image` 使用独立视觉配置：`VISION_API_KEY`、`VISION_BASE_URL`、`VISION_MODEL` 或 `VISION_MODEL_CHAIN`；未配置 `VISION_API_KEY` 时会回退到 `DASHSCOPE_API_KEY` / `LLM_API_KEY`。
- `VISION_MODEL` 必须选择支持图片输入的百炼多模态模型；纯文本模型即使可调用，也不能完成视觉理解。
- 当前实现调用 `POST /api/v1/services/aigc/multimodal-generation/generation`，请求内容按图片在前、文本提示词在后的顺序发送。

## image-view-mcp

- 目录：`image-view-mcp/`
- 技术栈：Node.js ESM + TypeScript，MCP SDK，DashScope 百炼多模态同步接口。
- 常用命令：
  - `npm ci`：首次检出、缺少 `node_modules/` 或本地找不到 `tsc` 时，按 `package-lock.json` 安装依赖。
  - `npm run check`：TypeScript 类型检查。
  - `npm test`：运行 Node 测试。
  - `npm run build`：构建到 `dist/`。
  - `npm run dev`：以 `tsx src/index.ts` 启动开发服务。
- 工具包括 `analyze_image`，专门用于图片描述、元素识别、截图理解和多图对比等只读视觉理解场景。
- 配置环境变量：
  - `DASHSCOPE_API_KEY` 必填。
  - `DASHSCOPE_BASE_URL` 默认 `https://dashscope.aliyuncs.com`。
  - `VISION_MODEL` 必填，建议使用 `qwen3.7-plus` 这类支持图片输入的多模态模型。
  - `VISION_MODEL_CHAIN` 可选，支持内联 JSON 或 `file:` 路径，用于多模型回退。
- 当前实现调用 `POST /api/v1/services/aigc/multimodal-generation/generation`，请求内容按图片在前、文本提示词在后的顺序发送。
- 该模块不提供生图或图生图能力；生成类工具仍归属 `image-mcp`。

## search-mcp

- 目录：`search-mcp/`
- 技术栈：Node.js ESM + TypeScript，MCP SDK，`undici`，`dotenv`。
- 常用命令：
  - `npm ci`：安装锁定依赖。
  - `npm run check`：TypeScript 类型检查。
  - `npm test`：运行 Node 测试。
  - `npm run build`：构建到 `dist/`。
  - `npm run dev`：以 `tsx src/index.ts` 启动开发服务。
- 当前 `tsconfig` 使用 `rootDir = "."`，实际构建入口为 `search-mcp/dist/src/index.js`。
- Codex 全局配置中的 `search` MCP server 在 Linux 环境应指向 `/usr/bin/node` 和 `/home/zhangjianyong/project/z-mcp/search-mcp/dist/src/index.js`；搜索服务密钥保存在 `/home/zhangjianyong/.codex/config.toml`，不要写入项目文档。

## cdp-browser-mcp

- 目录：`cdp-browser-mcp/`
- 技术栈：Node.js ESM + TypeScript，MCP SDK，Playwright `chromium.connectOverCDP`。
- 常用命令：
  - `npm ci`：安装锁定依赖。
  - `npm run check`：TypeScript 类型检查。
  - `npm run build`：构建到 `dist/`。
  - `npm test`：运行 Chrome CDP 启动脚本测试。
  - `npm run dev`：以 `tsx src/index.ts` 启动开发服务。
- 当前 `tsconfig` 使用 `rootDir = "."`，实际构建入口为 `cdp-browser-mcp/dist/src/index.js`。
- Codex 全局配置中的 `cdp_browser` MCP server 在 Linux 环境应指向 `/usr/bin/node` 和 `/home/zhangjianyong/project/z-mcp/cdp-browser-mcp/dist/src/index.js`。
- 单个 MCP server 进程启动时读取一次 `CDP_ENDPOINT`，默认 `http://127.0.0.1:9222`；当前所有浏览器操作工具都连接这个进程级 endpoint，不支持单次工具调用动态切换 Chrome 实例。
- 如需同时控制系统 Chrome 和微信开发工具内置 Chrome，推荐在 MCP 客户端配置两个 server 条目，分别设置不同 `CDP_ENDPOINT`，例如系统 Chrome 用 `9222`，微信开发工具用另一个远程调试端口。
- `start_chrome_cdp` 工具支持传入 `cdp_port`、`chrome_bin`、`user_data_dir`、`profile_directory`、`log_file` 启动指定 Chrome；但启动后当前 MCP 进程不会自动切换到该端口，后续操作仍取决于该进程的 `CDP_ENDPOINT`。
- `scripts/start-chrome-cdp.sh` 会保守检测已有 Chrome/Chromium 进程；如果浏览器已运行但目标 CDP 端口不可访问，脚本会退出并提示手动用 `--remote-debugging-port` 重启。
