# ETF Scanner 质量门禁（MCP-Only）

## G1 数据完整性

通过：渲染所需关键字段齐全并可追溯到 MCP 返回。
不通过：进入失败或观察路径，不输出执行建议。

## G2 责任边界一致性

通过：报告未出现本地计算、估算或补算痕迹。
不通过：结果作废并标记口径违规。

## G3 执行一致性

通过：动作、参数、归因均与 MCP 返回一致。
不通过：对应标的降为非执行项。

## G4 异常披露

通过：错误、降级、覆盖不足、无候选原因均显式披露。
不通过：禁止输出指令化建议。

## G5 可解释性

通过：每只标的均有来源字段、动作依据、风险提示。
不通过：仅输出保守结论。

## G5.5 Universe 来源可用性

通过：`stock-data__etf_universe` 调用成功且返回 `items.length > 0`。
不通过：立即失败并终止主流程（不调用 `etf_batch_decide`），错误码 `UNIVERSE_SOURCE_UNAVAILABLE`。

## G6 Universe 完整性（Preflight）

通过：`outsideUniverseSymbols == 0` 且 `duplicateWithinBatch == 0` 且 `duplicateAcrossBatches == 0` 且 `missingUniverseSymbols == 0`。
不通过：立即失败并终止主流程（不调用 `etf_batch_decide`），错误码 `UNIVERSE_INTEGRITY_FAILED`。

## G7 Universe 覆盖审计（Postflight）

通过：`actualOutsideUniverse == 0` 且 `actualDuplicates == 0` 且 `actualMissingUniverse == 0`。
不通过：进入失败路径，不输出交易建议，错误码 `UNIVERSE_INTEGRITY_FAILED`。
