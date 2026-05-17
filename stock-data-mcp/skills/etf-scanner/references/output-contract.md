# ETF Scanner 输出最小契约（MCP-Only）

## 原则

- 不要求固定段落、固定标题、固定表格。
- 输出必须可追溯到 MCP 返回字段。
- 禁止补造数值、补造委托、补造风险结论。

## 必含信息

1. 决策结论：`可交易/观察/不交易`
2. 决策理由：`action`、`actionReasons`、`globalChecks` 对应字段
3. 风险状态：关键门禁通过/不通过
4. 挂单建议：仅在可执行动作下给出

## 挂单建议最小字段

- `symbol`
- `side`
- `action`
- `quantity`
- `priceType`
- `rationale`

可选增强字段：`entryPrice`、`stopLoss`、`score`、`symbolExposure/symbolCap/symbolRatio`、`theme/themeExposure/themeCap/themeRatio`。

数量语义：
- `targetQty/deltaQty` 是 MCP 在风险预算与暴露约束下返回的最大可交易股数上限。
- 该上限已包含 `singleEtfExposureCapPct` 与 `themeExposureCapPct` 的约束结果。
- 实际委托股数需按执行层条件裁剪（流动性、滑点、盘口、最小成交单位、委托回报、实时资金）。
- 执行层可下调，不应在无新 MCP 结果时上调超过该上限。

## 阻断规则

以下场景必须禁止输出可执行挂单：
- `globalChecks.status=aborted`
- 关键字段缺失导致无法形成安全委托
- 风险门禁未通过

## 展示映射

动作与归因允许中文化展示，但只能是显示层映射，不得改写 MCP 原值。

归因最小映射（必须出现）：
- `theme_exposure_limit` -> `主题集中度上限触发`
- `buy_signal_confirmed` -> `买入信号成立`
- `unknown_reason` -> `未知原因（需排查）`
