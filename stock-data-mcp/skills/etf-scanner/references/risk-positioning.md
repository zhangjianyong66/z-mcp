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
- `action`
- `actionReasons`
- `unitCheck.status`
- `unitCheck.reason`

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
