# ETF Scanner v2.6.0

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
- 诊断工具：`stock-data__etf_universe`、`stock-data__etf_batch_analyze`、`stock-data__etf_batch_quote`、`stock-data__sector_list`、`stock-data__get_portfolio_and_orders`
- 持仓时效语义：从 MCP 工具读取到的持仓默认视为最新持仓，不输出滞后提示

## 默认参数

- `days=60`
- `source=xueqiu`
- `timeout=20`

## 输出结构

1. `Scan Meta`
2. `当前持有ETF（39池内）`
3. `候选交易（新开买入/加仓买入/换仓买入）`
4. `持有观察`
5. `不交易`
6. `可执行交易单（仅含新开买入/加仓买入/换仓买入）`
7. `Failure Ledger`

Universe 来源：
- 运行时唯一真源：MCP `stock-data__etf_universe`

区块语义说明：
- `当前持有ETF（39池内）`：当次 ETF 池（当前 39 只）内且当前有持仓的 ETF。
- `持有观察`：仅 `action=hold_watch` 的 ETF。
- 允许与候选/不交易区块重叠；同一 ETF 可同时出现在多个区块。
- `当前持有ETF（39池内）` 若为空，输出空态语句，不省略区块。

## 可执行交易单规则

- 仅从 `results[]` 过滤 `action in {open_buy,increase_buy,replace_buy}`。
- 有可执行项：输出表格字段
  - `代码`
  - `评分：score`
  - `入场价：entryPrice`
  - `止损价：stopLoss`
  - `目标数量：targetQty`
  - `调整数量：deltaQty`
  - `归因：中文`
- 若可执行项动作不止一种：增加 `动作` 列（仅中文）。
- 若可执行项动作仅一种：不显示 `动作` 列，并在表外输出 `本批可执行交易单动作统一为：<中文动作>`。
- 无可执行项：固定输出 `本批无可执行交易单（0条）`。
- 不允许模型补算、补值、重排或构造不存在的交易指令。

## 字段消费边界

报告中的数值必须来自以下返回字段：
- 顶层：`globalChecks`、`results`、`watchlist`、`errors`、`snapshotMeta`
- 动作参数：`entryPrice`、`stopLoss`、`targetQty`、`deltaQty`
- 暴露字段：`symbolExposure`、`symbolCap`、`symbolRatio`、`symbolExposureRoom`、`symbolExposureQty`
- 归因字段：`action`、`actionReasons`
- 分数字段：`score`（来自 MCP 返回的 `scoring.total` 或等价字段）
- 结构字段：`marketState.trend/trendZh`、`marketState.structurePass/structureReason/structureReasonZh`
- 结构快照字段：`marketState.price/ma5/ma10/ma20/high30/low30/priceVsMa10Pct/safetyMarginPct`

## 归因中文化显示

- 输出格式统一为：`中文1；中文2`（顺序与 MCP 返回一致，不展示码值）。
- 映射表：
  - `trend_not_tradeable` -> `趋势不可交易`
  - `structure_not_matched` -> `结构不匹配`
  - `insufficient_safety_margin` -> `安全边际不足（当前 safetyMarginPct% < 阈值 4.00%，差 gapPct%）`
  - `score_below_buy_threshold` -> `分数未达买入阈值`
  - `target_qty_below_lot` -> `目标数量不足一手`
  - `pending_order_already_sufficient` -> `已有挂单已满足目标数量`
  - `buy_signal_confirmed` -> `买入信号成立`
  - `unknown_reason` -> `未知原因（需排查）`
- 未命中映射时：`未定义中文标签`。
- 该规则仅影响展示文案，不改变 MCP 原始字段值。
- `gapPct` 规则：`max(0, 4.00 - safetyMarginPct)`，保留 2 位小数。
- 同一 ETF 多原因并存时，安全边际不足（数值化）优先展示。

## 动作中文化显示

- 输出格式统一为：`中文动作`（正文默认不展示码值）。
- 映射表：
  - `open_buy` -> `新开买入`
  - `increase_buy` -> `加仓买入`
  - `replace_buy` -> `换仓买入`
  - `hold_watch` -> `持有观察`
  - `no_trade` -> `不交易`
- 未命中映射时：`未定义中文标签`。
- 该规则仅影响展示文案，不改变 MCP 原始字段值。

关键字段缺失时：
- 输出结构化错误
- 不输出交易执行建议

## 每ETF结构展示（强制）

- `当前持有ETF（39池内）`、`候选交易`、`持有观察`、`不交易` 中每个 ETF 必须输出：
  - `代码：symbol；名称：name`
  - `评分：score`
  - `分数构成：技术位置：technicalPosition｜风险收益：riskReward｜板块热度：sectorHotness｜总分：score`
  - `趋势：trend（trendZh）`
  - `结构：通过|不通过（structureReasonZh）`
  - `结构快照：price/MA5/MA10/MA20，偏离MA10=priceVsMa10Pct%`
  - `安全边际：safetyMarginPct%（阈值4.00%）`
- 命中 `insufficient_safety_margin` 时，必须额外输出：
  - `安全边际不足（当前 {safetyMarginPct}% < 阈值 4.00%，差 {gapPct}%）`
- 以上字段全部来自 MCP，skill 禁止本地计算。
- `name` 来源固定为 `results[].name`；缺失或空值时展示：`名称：未知名称（MCP缺失）`。
- 分数构成字段来源固定为：`scoring.layerB.technicalPosition`、`scoring.layerB.riskReward`、`scoring.layerB.sectorHotness`、`scoring.total`。

## 聊天交付

- 首行固定：`以下为完整扫描报告（与 final_output.md 一致）`
- 非中止场景必须完整输出七段正文（含可执行交易单）
- 聊天完整报告是唯一必选交付，禁止仅给路径或摘要
- 聊天超长时必须分段连续输出直到完整
- 若 `final_output.md` 存在，必须与聊天正文严格全文一致
- 用户可见字段必须使用“中文键名 + 全角冒号（：）”，例如：`评分：51.186｜入场价：0.651｜止损价：0.609｜目标数量：7600｜调整数量：7600`

## 证据归档

优先级：`Chat Output (Required) > Artifact Files (Optional)`

默认不要求落盘。仅在用户显式要求归档时，写入目录：`/Users/zhangjianyong/project/z-mcp/stock-data-mcp/skills/etf-scanner/artifacts/etf-scanner/<run_id>/`

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
- 所有归档与 debug 文件必须写在以下根目录下，不允许写入其他工作目录（如 `~/.openclaw/workspace-squirrel`）：
  - `/Users/zhangjianyong/project/z-mcp/stock-data-mcp/skills/etf-scanner/artifacts`

开启 debug 后（且用户显式要求归档）新增可选文件：
- `/Users/zhangjianyong/project/z-mcp/stock-data-mcp/skills/etf-scanner/artifacts/etf-scanner/<run_id>/debug/flow.md`
- `/Users/zhangjianyong/project/z-mcp/stock-data-mcp/skills/etf-scanner/artifacts/etf-scanner/<run_id>/debug/tool_calls_debug.json`
- `/Users/zhangjianyong/project/z-mcp/stock-data-mcp/skills/etf-scanner/artifacts/etf-scanner/<run_id>/debug/issue.md`

## 免责声明

本技能输出仅为流程化分析，不构成投资建议。
