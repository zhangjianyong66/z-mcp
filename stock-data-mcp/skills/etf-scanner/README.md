# ETF Scanner v2.5.0

`etf-scanner` 是基于 `stock-data-mcp` 的 A 股 ETF 扫描技能。

## 核心原则

- 唯一计算源：`stock-data__etf_batch_decide`
- 模型职责：读取字段、组织结论、渲染报告
- 禁止行为：重算、估算、补算、插值、组合暴露推断

## 触发场景

- 扫描 ETF 建仓机会
- 批量分析 ETF
- ETF 打分与筛选
- 挂单调整建议

## 依赖工具

- 主工具：`stock-data__etf_batch_decide`
- 诊断工具：`stock-data__etf_batch_analyze`、`stock-data__etf_batch_quote`、`stock-data__sector_list`、`stock-data__get_portfolio_and_orders`
- 持仓时效语义：从 MCP 工具读取到的持仓默认视为最新持仓，不输出滞后提示

## 默认参数

- `days=60`
- `source=xueqiu`
- `timeout=20`

## 输出结构

1. `Scan Meta`
2. `Top Candidates`
3. `Watchlist`
4. `Execution Deltas`
5. `可执行交易单（仅含 open_buy/increase_buy/replace_buy）`
6. `Failure Ledger`

## 可执行交易单规则

- 仅从 `results[]` 过滤 `action in {open_buy,increase_buy,replace_buy}`。
- 有可执行项：输出表格字段
  - `代码`
  - `动作(action，编码+中文)`
  - `委托价(entryPrice)`
  - `止损价(stopLoss)`
  - `目标数量(targetQty)`
  - `本次增减(deltaQty)`
  - `归因(actionReason)`
- 无可执行项：固定输出 `本批无可执行交易单（0条）`。
- 不允许模型补算、补值、重排或构造不存在的交易指令。

## 字段消费边界

报告中的数值必须来自以下返回字段：
- 顶层：`globalChecks`、`results`、`watchlist`、`errors`、`snapshotMeta`
- 动作参数：`entryPrice`、`stopLoss`、`targetQty`、`deltaQty`
- 暴露字段：`symbolExposure`、`symbolCap`、`symbolRatio`、`symbolExposureRoom`、`symbolExposureQty`
- 归因字段：`action`、`actionReason`
- 结构字段：`marketState.trend/trendZh`、`marketState.structurePass/structureReason/structureReasonZh`
- 结构快照字段：`marketState.price/ma5/ma10/ma20/high30/low30/priceVsMa10Pct/safetyMarginPct`

## 归因中文化显示

- 输出格式统一为：`actionReason原码（中文）`。
- 映射表：
  - `trend_not_tradeable` -> `趋势不可交易`
  - `structure_not_matched` -> `结构不匹配`
  - `insufficient_safety_margin` -> `安全边际不足（当前 safetyMarginPct% < 阈值 4.00%，差 gapPct%）`
- 未命中映射时：`raw_code（未定义中文标签）`。
- 该规则仅影响展示文案，不改变 MCP 原始字段值。
- `gapPct` 规则：`max(0, 4.00 - safetyMarginPct)`，保留 2 位小数。
- 同一 ETF 多原因并存时，安全边际不足（数值化）优先展示。

## 动作中文化显示

- 输出格式统一为：`action原码（中文）`。
- 映射表：
  - `open_buy` -> `新开买入`
  - `increase_buy` -> `加仓买入`
  - `replace_buy` -> `换仓买入`
  - `hold_watch` -> `持有观察`
  - `no_trade` -> `不交易`
- 未命中映射时：`raw_action（未定义中文标签）`。
- 该规则仅影响展示文案，不改变 MCP 原始字段值。

关键字段缺失时：
- 输出结构化错误
- 不输出交易执行建议

## 每ETF结构展示（强制）

- `Top Candidates`、`Watchlist`、`Execution Deltas` 中每个 ETF 必须输出：
  - `趋势：trend（trendZh）`
  - `结构：通过|不通过（structureReasonZh）`
  - `结构快照：price/MA5/MA10/MA20，偏离MA10=priceVsMa10Pct%`
  - `安全边际：safetyMarginPct%（阈值4.00%）`
- 命中 `insufficient_safety_margin` 时，必须额外输出：
  - `安全边际不足（当前 {safetyMarginPct}% < 阈值 4.00%，差 {gapPct}%）`
- 以上字段全部来自 MCP，skill 禁止本地计算。

## 聊天交付

- 首行固定：`以下为完整扫描报告（与 final_output.md 一致）`
- 非中止场景必须完整输出六段正文（含可执行交易单）
- 聊天完整报告是唯一必选交付，禁止仅给路径或摘要
- 聊天超长时必须分段连续输出直到完整
- 若 `final_output.md` 存在，必须与聊天正文严格全文一致

## 证据归档

优先级：`Chat Output (Required) > Artifact Files (Optional)`

默认不要求落盘。仅在用户显式要求归档时，写入目录：`artifacts/etf-scanner/<run_id>/`

可选文件：
- `manifest.json`
- `input.json`
- `tool_calls.json`
- `tool_results.json`
- `scoring.json`
- `final_output.md`
- `failure_ledger.json`

失败示例：
- 仅有 `final_output.md` 等文件、聊天未完整输出报告：判定失败
- 聊天完整输出报告、未生成 `final_output.md`：判定通过

## Debug 日志（默认关闭）

- 默认不记录、不落盘 debug 日志。
- 仅当用户请求包含以下任一关键词时开启：
  - `记录debug日志`
  - `开启调试日志`
  - `保留排障日志`
- 开启后记录范围为主流程+诊断工具全量调用。
- 开启后记录内容必须包含：
  - 完整流程记录（步骤、状态、时间线）
  - 工具调用入参/出参、耗时、错误
  - 问题描述、输出结果
  - 保存文件路径索引
- debug 日志不脱敏，按原始内容记录。

开启 debug 后（且用户显式要求归档）新增可选文件：
- `artifacts/etf-scanner/<run_id>/debug/flow.md`
- `artifacts/etf-scanner/<run_id>/debug/tool_calls_debug.json`
- `artifacts/etf-scanner/<run_id>/debug/issue.md`

## 免责声明

本技能输出仅为流程化分析，不构成投资建议。
