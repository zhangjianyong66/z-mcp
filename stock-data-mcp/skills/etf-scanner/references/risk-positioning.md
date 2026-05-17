# ETF Scanner 仓位与动作消费规范（MCP-Only）

本文档用于约束 skill 如何消费 `etf_batch_decide` 返回结果，不定义任何本地计算步骤。

## 计算责任边界

- 所有仓位与动作相关数值均由 MCP 返回。
- skill 禁止对仓位、资金、暴露、价格做二次推导。
- 任一必要字段缺失时，必须走失败路径。

## 必需字段

每只标的至少需要：
- `entryPrice`
- `stopLoss`
- `targetQty`
- `deltaQty`
- `symbolExposure`
- `symbolCap`
- `symbolRatio`
- `symbolExposureRoom`
- `symbolExposureQty`
- `theme`
- `themeExposure`
- `themeCap`
- `themeRatio`
- `themeExposureRoom`
- `themeExposureQty`
- `action`
- `actionReasons`
- `unitCheck.status`
- `unitCheck.reason`

数量语义（执行边界）：
- `targetQty/deltaQty` 是 MCP 在约束下给出的最大可交易股数上限，不是必须全量下单股数。
- 上限已包含单 ETF 上限与主题集中度上限。
- 实际下单股数由执行层按实时交易条件裁剪，裁剪后不得超过该上限。

## 动作字典

- `open_buy`
- `increase_buy`
- `replace_buy`
- `hold_watch`
- `no_trade`

skill 仅映射与渲染上述动作，不得改写动作语义。

动作展示中文化（仅展示层）：
- `open_buy` -> `新开买入`
- `increase_buy` -> `加仓买入`
- `replace_buy` -> `换仓买入`
- `hold_watch` -> `持有观察`
- `no_trade` -> `不交易`
- 未命中映射：`raw_action（未定义中文标签）`

## 错误与中止

- `UNIT_MISMATCH`：全局中止，仅输出错误报告。
- `MISSING_REQUIRED_FIELD`：标记失败，不输出交易建议。
- `globalChecks.status=aborted`：终止执行路径。

## 禁止项

- 禁止出现组合暴露字段与组合暴露结论。
- 禁止新增任何仓位衍生字段。
- 禁止“按规则重算”文案。
