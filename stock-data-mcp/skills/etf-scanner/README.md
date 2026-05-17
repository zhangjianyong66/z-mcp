# ETF Scanner v2.7.0

`etf-scanner` 是 `stock-data-mcp` 的使用增强文档，目标是指导如何基于 MCP 返回做 ETF 交易决策与挂单。

## 核心定位

- 仅补充工具使用方法，不定义模板化报告格式
- 不要求保存日志或 debug 落盘
- 唯一计算源：`stock-data__etf_batch_decide`
- 唯一标的池来源：`stock-data__etf_universe`

## 推荐流程

1. 调 `stock-data__etf_universe` 获取当次 ETF 池。
2. 调 `stock-data__etf_batch_decide` 获取 `globalChecks/results/watchlist/errors`。
3. 先做全局门禁判断，再做单标的 action 分流。
4. 只在可执行 action 下生成挂单建议。

## 最小输出要求

输出形式可自由，但必须包含：
- 决策结论（可交易/观察/不交易）
- 决策理由（来自 `action/actionReasons/globalChecks`）
- 风险状态（是否通过关键门禁）
- 挂单建议（仅可执行时）

## 挂单建议最小字段

适用动作：`open_buy`、`increase_buy`、`replace_buy`

每条建议至少包含：
- `symbol`
- `side`（买入场景为 `buy`）
- `action`
- `quantity`（优先 `deltaQty`，缺失用 `targetQty`）
- `priceType`（`limit|market`）
- `rationale`

建议附带（若有）：`entryPrice`、`stopLoss`、`score`、`symbolExposure/symbolCap/symbolRatio`、`theme/themeExposure/themeCap/themeRatio`。

数量语义：
- `targetQty/deltaQty` 是 MCP 在风险预算与暴露约束下给出的最大可交易股数上限。
- 该上限已包含单 ETF 上限和主题集中度上限约束（`singleEtfExposureCapPct`、`themeExposureCapPct`）。
- 实际下单股数需要结合流动性、滑点、盘口深度、最小成交单位、委托回报、账户实时可用资金进行执行层裁剪。
- 执行层可低于上限，不应在无新 MCP 结果时高于上限。

## 下单前检查

- 数量必须大于 0
- 不超过单 ETF 暴露上限
- 不与当前 pending 单重复或冲突
- 若 `globalChecks.status=aborted` 或关键字段缺失：只输出阻断原因，不输出挂单建议

## 归因展示映射

- `theme_exposure_limit` -> `主题集中度上限触发`
- `buy_signal_confirmed` -> `买入信号成立`
- `unknown_reason` -> `未知原因（需排查）`

## 免责声明

本技能输出仅为流程化分析，不构成投资建议。
