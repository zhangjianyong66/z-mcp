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
