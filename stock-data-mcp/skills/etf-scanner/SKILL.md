---
name: etf-scanner
description: >
  使用 stock-data MCP 对 A 股 ETF 池做批量扫描，基于 MCP 返回结果做交易决策与挂单建议。
  当用户提到“扫描ETF”“批量分析ETF”“ETF建仓机会”“ETF打分”“挂单调整”“中短线ETF筛选”时触发。
license: "Skill distillation for personal and educational use."
---

# ETF Scanner v2.7.0

## Overview

本技能仅用于补充 `stock-data-mcp` 工具使用说明，不定义固定报告模板，不要求保存日志记录。

核心边界：
- 计算唯一真源：`stock-data__etf_batch_decide`
- 标的池唯一真源：`stock-data__etf_universe`
- 仅消费 MCP 已返回字段，禁止重算、估算、补算、插值
- 禁止输出 MCP 未提供的新数值或臆造委托参数

## Tool Contract

主流程工具：
1. `stock-data__etf_universe`
2. `stock-data__etf_batch_decide`

诊断工具（仅排障）：
1. `stock-data__etf_batch_analyze`
2. `stock-data__etf_batch_quote`
3. `stock-data__sector_list`
4. `stock-data__get_portfolio_and_orders`

参数边界：
- 批量调用每批 `<=40` 个 symbol
- 默认参数：`days=60`、`source=xueqiu`、`timeout=20`

## Execution Flow

1. 调用 `stock-data__etf_universe` 获取当次 ETF 池，按返回顺序去重后分批。
2. 仅对当次池内 symbol 调用 `stock-data__etf_batch_decide`。
3. 读取并消费 `globalChecks/results/watchlist/errors/snapshotMeta`。
4. 若 `globalChecks.status=aborted` 或关键风险门禁失败，终止交易建议，仅输出阻断原因。
5. 对 `results[]` 逐条给出决策结论：`可交易/观察/不交易`，并附 MCP 字段级理由。

## Minimal Output Contract

不要求固定段落、固定标题、固定文案；但输出必须包含：
- 决策结论：`可交易/观察/不交易`
- 决策理由：来自 `action`、`actionReasons`、`globalChecks`
- 风险状态：关键闸门通过/不通过及对应原因
- 挂单建议：仅在可执行时给出

可选分组（便于阅读，不强制）：
- 候选交易（`action in {open_buy,increase_buy,replace_buy}`）
- 持有观察（`action=hold_watch`）
- 不交易（`action=no_trade`）

## Order Guidance (Action -> Order)

仅当 `action in {open_buy,increase_buy,replace_buy}` 且全局门禁通过时，输出挂单建议。

每条挂单建议最小字段：
- `symbol`
- `side`（买入场景固定为 `buy`）
- `action`（`open_buy|increase_buy|replace_buy`）
- `quantity`（优先 `deltaQty`，缺失则使用 `targetQty`）
- `priceType`（`limit|market`，需明确）
- `rationale`（来自 `actionReasons` 中文化或原文）

建议附带字段（若 MCP 返回）：
- `entryPrice`
- `stopLoss`
- `score`
- `symbolExposure/symbolCap/symbolRatio`
- `theme/themeExposure/themeCap/themeRatio`

数量语义（必须遵循）：
- `targetQty/deltaQty` 是 MCP 在风险预算与暴露约束下给出的最大可交易股数上限。
- 该上限已包含单 ETF 上限与主题集中度上限约束（对应 `singleEtfExposureCapPct`、`themeExposureCapPct`）。
- 实际下单股数应结合盘中流动性、滑点、盘口深度、最小成交单位、委托回报和账户实时可用资金做执行层裁剪。
- 执行层可小于该上限，不得在无新 MCP 结果时扩大为超过该上限。

下单前校验：
- `quantity > 0`
- 不超过单 ETF 暴露上限（按 MCP 暴露字段判断）
- 与现有 `pending` 挂单不重复、不冲突（数量/方向/标的一致性）

阻断条件（任一命中则不输出可执行挂单）：
- `globalChecks.status=aborted`
- 关键字段缺失（如 `action/targetQty/deltaQty` 无法形成安全委托）
- 关键风险原因未解除（如结构未通过、安全边际不足且不满足策略）

## Field Mapping

主要字段：
- 结果层：`results[].symbol/name/action/actionReasons/score`
- 订单层：`entryPrice/stopLoss/targetQty/deltaQty`
- 风险层：`marketState.*`、`symbolExposure/symbolCap/symbolRatio`
- 全局层：`globalChecks`、`errors`、`snapshotMeta`

中文映射仅用于展示，不修改 MCP 原始值：
- 动作：`open_buy`=新开买入，`increase_buy`=加仓买入，`replace_buy`=换仓买入，`hold_watch`=持有观察，`no_trade`=不交易
- 常见原因：`trend_not_tradeable`、`structure_not_matched`、`insufficient_safety_margin`、`score_below_buy_threshold`、`target_qty_below_lot`、`pending_order_already_sufficient`
- 归因映射：`theme_exposure_limit` -> `主题集中度上限触发`
- 归因映射：`buy_signal_confirmed` -> `买入信号成立`
- 归因映射：`unknown_reason` -> `未知原因（需排查）`

## Hard Rules

1. 禁止伪造或推导 MCP 未返回的交易参数。
2. 禁止在中止/风控失败场景输出可执行挂单。
3. 挂单建议必须可追溯到 MCP 字段。
4. 同一 symbol 若存在 `pending` 订单冲突，必须先给冲突处理建议再给新单。

## References

- 输出最小契约：`references/output-contract.md`
- 质量门禁：`references/quality-gates.md`
- 降级策略：`references/fallback-playbook.md`
- 测试用例：`references/test-cases.md`
- 版本记录：`references/revision-log.md`
