---
name: etf-scanner
description: >
  使用 stock-data MCP 对 A 股 ETF 池做批量扫描，输出中短线建仓候选、观察名单与挂单调整建议。
  当用户提到“扫描ETF”“批量分析ETF”“ETF建仓机会”“ETF打分”“挂单调整”“中短线ETF筛选”时触发。
license: "Skill distillation for personal and educational use."
---

# ETF Scanner v2.6.0

## Overview

本技能采用 MCP-first 模式：
- 候选池固定来自 MCP 工具 `stock-data__etf_universe`
- 主流程只调用 `stock-data__etf_batch_decide`
- 大模型只做字段读取、映射渲染、异常分流
- 聊天窗口默认回显完整报告正文

计算责任边界：
- `etf_batch_decide` 是唯一计算源
- 禁止二次计算、补算、估算、插值
- 禁止输出任何未在 MCP 返回中提供的新数值字段
- 通过 MCP 获取的持仓信息默认视为最新持仓，禁止输出“快照滞后”提示

## Tool Contract

主流程工具：
1. `stock-data__etf_universe`
2. `stock-data__etf_batch_decide`

诊断工具（仅排障）：
1. `stock-data__etf_universe`
2. `stock-data__etf_batch_analyze`
3. `stock-data__etf_batch_quote`
4. `stock-data__sector_list`
5. `stock-data__get_portfolio_and_orders`

角色约束：
- `stock-data__etf_universe` 在主流程中为必调工具（ETF 池唯一真源），在诊断流程中用于复核与比对（可复核）。

参数边界：
- 批量调用每批 `<=20` 个 symbol
- 默认参数：`days=60`、`source=xueqiu`、`timeout=20`

## Execution Flow

### Step 0: Bootstrap

1. 生成 `run_id=<YYYYMMDD-HHMMSS>-<shortid>`。
2. 固定 `artifactRoot=/Users/zhangjianyong/project/z-mcp/stock-data-mcp/skills/etf-scanner/artifacts`。
3. 创建目录：`<artifactRoot>/etf-scanner/<run_id>/`。
4. 初始化 `manifest.json`。
5. 初始化 `debug.enabled=false`。
6. 在 `manifest.json` 回填 `artifactRoot` 与 `runDir`（绝对路径）。
7. 若用户请求命中 debug 关键词（`记录debug日志`、`开启调试日志`、`保留排障日志`），设置 `debug.enabled=true`，创建 `<artifactRoot>/etf-scanner/<run_id>/debug/`，并在 `manifest.json` 回填 `debug.logPath`（绝对路径）。

### Step 1: Input Guard

1. 校验标的格式与批次边界。
2. 记录输入参数与默认参数补全结果。
3. 写入 `input.json`。

### Step 2: Load Universe

1. 调用 `stock-data__etf_universe`。
2. 仅以该工具返回作为唯一真源，提取当次 symbol 列表（禁止外部补充、替换、推断）。
3. 标准化 symbol（`SH|SZ+6位` -> 裸码）并按出现顺序去重。
4. 按顺序分批（每批 `<=20`）生成 `planned_batches`。
5. 写入 `input.json`（至少包含 `universeSourceTool/universeGeneratedAt/universeCount/universeSymbolsNormalized/plannedBatches`）。

### Step 2.5: Universe Integrity Gate

1. 在调用前执行 Preflight 校验并写 `preflight_check.json`：
   - `outsideUniverseSymbols`（计划调用但不在 universe）
   - `duplicateWithinBatch`
   - `duplicateAcrossBatches`
   - `missingUniverseSymbols`（在 universe 但未进入计划调用）
2. 若任一异常数组非空，立即终止本次运行：
   - 不调用 `stock-data__etf_batch_decide`
   - 写入 `failure_ledger.json`
   - 错误码：`UNIVERSE_INTEGRITY_FAILED`
3. 若 `stock-data__etf_universe` 调用失败：
   - 不调用 `stock-data__etf_batch_decide`
   - 写入 `failure_ledger.json`
   - 错误码：`UNIVERSE_SOURCE_UNAVAILABLE`

### Step 3: Batch Decide

1. 仅按 `planned_batches` 分批调用 `stock-data__etf_batch_decide`，禁止混入账户持仓或临时追加标的。
2. 读取并落盘：`globalChecks/results/watchlist/errors/snapshotMeta`。
3. 写入 `tool_calls.json` 与 `tool_results.json` 原始响应。
4. 若 `debug.enabled=true`，同步写入 `debug/tool_calls_debug.json`，记录主流程与诊断工具全部调用的 `step/toolName/request/response/error/durationMs/timestamp`。

### Step 3.5: Coverage Audit

1. 从 `tool_calls.json` 汇总实际调用 symbol，执行 Postflight 集合比对并写 `coverage_report.json`：
   - `actualOutsideUniverse`
   - `actualDuplicates`
   - `actualMissingUniverse`
   - `coveragePct`
2. 若任一异常数组非空：
   - 写入 `failure_ledger.json`
   - 错误码：`UNIVERSE_INTEGRITY_FAILED`
   - 进入失败路径，不输出交易建议。

### Step 4: Parse Payload

1. 仅消费 MCP 返回字段，不做任何推导。
2. 若 `globalChecks.status=aborted`，直接进入终止路径。
3. 若关键字段缺失，进入失败路径并写 `MISSING_REQUIRED_FIELD`。

关键字段：
- `score`
- `entryPrice`
- `stopLoss`
- `targetQty`
- `deltaQty`
- `symbolExposure`
- `symbolCap`
- `symbolRatio`
- `action`
- `actionReasons`
- `marketState.trend/trendZh`
- `marketState.structurePass/structureReason/structureReasonZh`
- `marketState.price/ma5/ma10/ma20/high30/low30`
- `marketState.priceVsMa10Pct/safetyMarginPct`

### Step 5: Projection

1. 分区规则：
   - 候选交易：严格依据 MCP 原始 `action in {open_buy,increase_buy,replace_buy}`。
   - 当前持有ETF：严格依据“当次 universe（当前 39 只）内且当前持仓>0”。
   - 持有观察：严格依据 MCP 原始 `action=hold_watch`。
   - 不交易：严格依据 MCP 原始 `action=no_trade`。
2. 当前持有ETF允许与候选交易/持有观察/不交易区块重叠（同一 ETF 可同时出现）。
3. 候选上限、观察区间、闸门状态均以 MCP 字段为准。
4. 写入 `scoring.json`。

### Step 6: Render

1. 渲染动作字典：`open_buy`、`increase_buy`、`replace_buy`、`hold_watch`、`no_trade`。
2. `action` 展示统一映射为中文标签（默认不展示码值），中文标签映射：
   - `open_buy` -> `新开买入`
   - `increase_buy` -> `加仓买入`
   - `replace_buy` -> `换仓买入`
   - `hold_watch` -> `持有观察`
   - `no_trade` -> `不交易`
   - 未命中映射 -> `未定义中文标签`
3. 区块级动作显隐规则：
   - `当前持有ETF（39池内）`：始终展示动作字段（中文标签）。
   - `持有观察`：区块语义唯一，默认省略动作字段。
   - `不交易`：区块语义唯一，默认省略动作字段。
   - `候选交易`：若区块内仅 1 种动作，省略动作字段并在区块外追加：`本区块动作统一为：<中文动作>`；若存在多种动作，展示动作字段（中文标签）。
4. 四个 ETF 明细区块（`当前持有ETF（39池内）/候选交易/持有观察/不交易`）每条必须展示标识行：`代码：symbol；名称：name`。
   - `name` 来源固定为 MCP `results[].name`，禁止外部补名或推断。
   - 若 `name` 缺失或为空，展示：`名称：未知名称（MCP缺失）`。
5. 仅引用 MCP 返回参数并以中文键名展示：`入场价：entryPrice`、`止损价：stopLoss`、`目标数量：targetQty`、`调整数量：deltaQty`。
6. 四个 ETF 明细区块（`当前持有ETF（39池内）/候选交易/持有观察/不交易`）每条必须展示 `评分：score`（来源于 MCP 返回，不可补算）。
7. 四个 ETF 明细区块每条必须追加“分数构成”行：`分数构成：技术位置：technicalPosition｜风险收益：riskReward｜板块热度：sectorHotness｜总分：score`。
   - 字段来源固定：`scoring.layerB.technicalPosition`、`scoring.layerB.riskReward`、`scoring.layerB.sectorHotness`、`scoring.total`。
8. 仅引用 MCP 返回暴露字段并以中文键名展示：`当前暴露：symbolExposure`、`暴露上限：symbolCap`、`暴露占比：symbolRatio`、`剩余暴露空间：symbolExposureRoom`、`剩余可买数量：symbolExposureQty`。
9. `actionReasons` 展示统一映射为“仅中文原因列表”（按 MCP 返回顺序渲染，不展示码值），中文标签映射：
   - `trend_not_tradeable` -> `趋势不可交易`
   - `structure_not_matched` -> `结构不匹配`
   - `insufficient_safety_margin` -> `安全边际不足（当前 safetyMarginPct% < 阈值 4.00%，差 gapPct%）`
   - `score_below_buy_threshold` -> `分数未达买入阈值`
   - `target_qty_below_lot` -> `目标数量不足一手`
   - `pending_order_already_sufficient` -> `已有挂单已满足目标数量`
   - `buy_signal_confirmed` -> `买入信号成立`
   - `unknown_reason` -> `未知原因（需排查）`
   - 未命中映射 -> `未定义中文标签`
10. 强制生成 `可执行交易单（仅含新开买入/加仓买入/换仓买入）` 区块。
11. 仅过滤 `results[].action in {open_buy,increase_buy,replace_buy}`，不得追加策略条件。
12. 若过滤结果为空，固定输出：`本批无可执行交易单（0条）`。
13. 若过滤结果非空，逐条映射字段：`代码/名称：name/评分：score/入场价：entryPrice/止损价：stopLoss/目标数量：targetQty/调整数量：deltaQty/归因：actionReasons(仅中文)`，并按以下规则控制 `动作` 列：
   - 若可执行交易单内存在多种动作，展示 `动作` 列（仅中文标签）。
   - 若可执行交易单内仅 1 种动作，删除 `动作` 列，并在表外追加：`本批可执行交易单动作统一为：<中文动作>`。
14. 映射顺序沿用 MCP 返回顺序，不做二次排序与数值重格式化。
15. 候选交易/持有观察/不交易三类区块中，每个 ETF 必须追加一行结构信息：
    `趋势：trend（trendZh）；结构：通过|不通过（structureReasonZh）；结构快照：price/MA5/MA10/MA20, 偏离MA10=priceVsMa10Pct%；安全边际：safetyMarginPct%（阈值4.00%）`。
16. `insufficient_safety_margin` 必须使用固定格式：
    `安全边际不足（当前 {safetyMarginPct}% < 阈值 4.00%，差 {gapPct}%）`；
    其中 `gapPct=max(0,4.00-safetyMarginPct)`，保留 2 位小数。
17. 同一 ETF 命中多原因时，`insufficient_safety_margin` 文案优先展示在第一条，其余原因按原顺序追加。
18. 若当次 universe 内无持仓 ETF，`当前持有ETF（39池内）` 区块必须输出空态语句，不得省略该区块。

### Step 7: Finalize

1. 非中止场景生成七段完整报告正文（含 `可执行交易单`）。
2. 聊天首行固定：`以下为完整扫描报告（与 final_output.md 一致）`。
3. 校验 `可执行交易单` 区块必存在（表格或空单语句二选一）。
4. 若用户显式要求归档，再落盘：`final_output.md`、`failure_ledger.json`、回填 `manifest.json`。
5. 聊天输出过长时必须分段连续回复，直到完整报告全部输出完毕，禁止降级为“仅文件”。
6. 若 `debug.enabled=true`，额外写入：
   - `debug/flow.md`：完整流程记录（步骤、状态、时间线）
   - `debug/issue.md`：问题描述、输出结果、关联文件路径索引
7. 若任一归档/调试文件实际落盘路径不在 `artifactRoot` 下，写入 `failure_ledger.json` 错误码 `ARTIFACT_PATH_MISMATCH`。

## Hard Rules

1. 禁止伪造或推导行情、仓位、评分、暴露、数量、价格。
2. `UNIT_MISMATCH` 或 `globalChecks.status=aborted` 时必须终止，不输出交易建议。
3. 关键字段缺失必须失败，不允许补值。
4. 暴露判断只允许单 ETF 口径，禁止组合口径叙述。
5. 最终 assistant 回复必须完整输出报告正文，禁止仅输出路径、摘要或“见文件”。
6. `可执行交易单` 仅允许引用 MCP 返回动作与参数，禁止模型补单或猜测委托。
7. 归因中文化仅为展示层映射，禁止改写或覆盖 MCP 原始 `actionReasons`。
8. 动作中文化仅为展示层映射，禁止改写或覆盖 MCP 原始 `action`。
9. 若 `final_output.md` 存在，聊天回复必须与其严格全文一致。
10. 若聊天缺失完整报告，则本次运行判定失败，即使文件齐全也失败。
11. Universe 唯一真源必须是 MCP `stock-data__etf_universe` 返回，禁止在主流程中使用本地或外部 symbol 源。
12. 出现 `outsideUniverseSymbols/duplicateAcrossBatches/missingUniverseSymbols` 任一非空时必须失败并终止主流程。
13. debug 日志默认关闭；仅当用户请求命中固定关键词时开启。
14. 开启 debug 后必须记录完整流程、工具调用入参/出参、问题描述、输出结果和保存文件路径。
15. debug 记录不做脱敏，按原始内容写入。
16. 所有归档与 debug 落盘路径必须在 `artifactRoot` 下，禁止写入其他工作目录。
17. 用户可见报告正文默认不展示动作码值，仅展示中文动作标签。
18. 用户可见报告正文默认不展示归因码值，仅展示中文归因文案。
19. 用户可见报告正文必须使用“中文键名 + 全角冒号（：）”格式，禁止输出 `score=...`、`entryPrice=...` 等英文字段键。
20. 可执行交易单若全表动作一致，必须删除 `动作` 列。
21. `持有观察` 与 `不交易` 区块语义唯一时，必须省略动作字段。
22. `候选交易` 区块若动作唯一，必须省略动作字段并输出：`本区块动作统一为：<中文动作>`；若动作不唯一，必须展示动作字段。
23. `当前持有ETF（39池内）` 仅允许出现“当次 universe 内且当前持仓>0”的 ETF；不满足条件的 ETF 禁止进入该区块。
24. `持有观察` 仅允许出现 `action=hold_watch` 的 ETF。
25. 允许同一 ETF 同时出现在 `当前持有ETF（39池内）`、`候选交易`、`持有观察` 与 `不交易` 区块。

## Debug Logging Contract

触发规则：
- 默认 `debug.enabled=false`，不生成 debug 文件。
- 仅当用户请求命中任一固定关键词时开启：
  - `记录debug日志`
  - `开启调试日志`
  - `保留排障日志`

记录范围（开启后强制）：
- 主流程工具：`stock-data__etf_universe`、`stock-data__etf_batch_decide`
- 诊断工具：`stock-data__etf_universe`、`stock-data__etf_batch_analyze`、`stock-data__etf_batch_quote`、`stock-data__sector_list`、`stock-data__get_portfolio_and_orders`

记录内容（开启后强制）：
- 完整流程记录：步骤、开始/结束时间、状态、异常点。
- 工具调用记录：入参、出参、错误、耗时、调用时间戳。
- 问题描述与结果：失败原因/结论、输出结果摘要。
- 路径索引：本次执行生成的所有证据文件路径。

路径约定（开启后生成）：
- `artifactRoot=/Users/zhangjianyong/project/z-mcp/stock-data-mcp/skills/etf-scanner/artifacts`
- `runDir=<artifactRoot>/etf-scanner/<run_id>/`
- `debugDir=<runDir>/debug/`
- `<debugDir>/flow.md`
- `<debugDir>/tool_calls_debug.json`
- `<debugDir>/issue.md`

## Artifact Contract

必选产物：
- 聊天中的完整最终报告（可分段连续输出）

可选产物（仅在显式要求归档时生成）：
- `manifest.json`
- `input.json`
- `preflight_check.json`
- `tool_calls.json`
- `tool_results.json`
- `coverage_report.json`
- `scoring.json`
- `final_output.md`
- `failure_ledger.json`

debug 产物（仅在 `debug.enabled=true` 且显式要求归档时生成）：
- `debug/flow.md`
- `debug/tool_calls_debug.json`
- `debug/issue.md`

终止场景可选最小证据集（仅在启用归档时）：
- `manifest.json`
- `input.json`
- `tool_calls.json`
- `failure_ledger.json`

## References

- ETF 池：MCP `stock-data__etf_universe`
- 输出协议：`references/output-contract.md`
- 降级策略：`references/fallback-playbook.md`
- 质量门禁：`references/quality-gates.md`
- 测试用例：`references/test-cases.md`
- 变更记录：`references/revision-log.md`
- Debug 模板：`references/debug-log-template.md`
