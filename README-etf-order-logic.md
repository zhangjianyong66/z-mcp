# ETF 下单逻辑梳理（skill + stock-data-mcp）

更新时间：2026-05-05

本文梳理当前真实生效的 ETF 下单逻辑，覆盖：
- Skill 层（`~/.openclaw/skills/etf-scanner`）
- MCP 计算层（`/Users/zhangjianyong/project/z-mcp/stock-data-mcp`）

结论先行：
- 所有评分、仓位、动作判定都在 `etf_batch_decide` 内计算。
- Skill 不再做数学计算，只做字段消费、中文映射、报告渲染。
- 真正“可执行交易单”来源于 `results[].action in {open_buy, increase_buy, replace_buy}`。

## 1. 调用链路

1. skill 分批调用 `stock-data__etf_batch_decide`（每批最多 20 个 symbol）。
2. MCP 工具 `etf_batch_decide` 自动读取账户快照（持仓+挂单），并并行拉取：
   - `etf_batch_analyze`
   - `etf_batch_quote`
   - `sector_list`
3. `runEtfBatchDecide` 逐标的计算：单位校验、仓位上限、评分、动作。
4. skill 仅按返回字段渲染报告与“可执行交易单”。

核心入口：
- `stock-data-mcp/src/index.ts`（工具注册）
- `stock-data-mcp/src/etf-batch-decide.ts`（全部计算）

## 2. MCP 输入与默认参数

工具：`etf_batch_decide`

- 必填：`symbols`（1-20）
- 可选：
  - `days` 默认 `60`
  - `source` 默认 `xueqiu`
  - `timeout` 默认 `20`
  - `riskPct` 默认 `0.01`
  - `singleEtfExposureCapPct` 默认 `0.2`

账户数据不需要调用方传入，由 MCP 内部自动读取。

## 3. 单标的计算逻辑（真实公式）

以下均来自 `src/etf-batch-decide.ts`：

### 3.1 单位与口径检查（Unit Guard）

任一条件不满足即触发 `unitFailure`：
- `0 < currentPrice < 100`
- `positionQty`、`pendingBuyQty` 必须是整数
- 数量必须是 100 股整数倍
- `totalCapital`、`availableCapital`、`marketValue` 不能为负

若任意标的出现 `unitFailure`：
- 顶层 `globalChecks.status = aborted`
- `abortReason = unit_mismatch`
- 错误列表写入 `UNIT_MISMATCH`
- 动作强制 `no_trade`

### 3.2 仓位与数量

- `symbolCap = totalCapital * singleEtfExposureCapPct`
- `symbolExposure = positionMarketValue + pendingBuyQty * price`
- `symbolRatio = symbolExposure / symbolCap`
- `entryPrice = min(price, ma5 * 1.002)`
- `stopLoss = low30 * 0.94`
- `unitRisk = entryPrice - stopLoss`
- `riskBudget = totalCapital * riskPct`
- `riskQty = floor_to_100(riskBudget / unitRisk)`（`unitRisk <= 0` 则 0）
- `capitalQty = floor_to_100(availableCapital / entryPrice)`
- `symbolExposureRoom = max(0, symbolCap - symbolExposure)`
- `symbolExposureQty = floor_to_100(symbolExposureRoom / entryPrice)`
- `targetQty = max(0, min(riskQty, capitalQty, symbolExposureQty))`
- `deltaQty = targetQty - pendingBuyQty`

说明：`floor_to_100` = 向下取整到 100 股手数。

### 3.3 Layer A 闸门

`layerAReasons` 触发条件：
- 趋势不在 `bullish/rangebound` -> `trend_not_tradeable`
- 结构不满足 -> `structure_not_matched`
- 安全边际不足（`(high30 - price) / high30 < 0.04`）-> `insufficient_safety_margin`
- `stopLoss >= entryPrice` -> `risk_not_definable`
- `symbolExposureQty < 100` -> `insufficient_exposure_room`
- 单位失败 -> `unit_mismatch:*`

`passedLayerA = (layerAReasons.length === 0)`。

### 3.4 Layer B 评分

总分 `totalScore` 上限 100，由四段组成：
- `technicalPosition`
- `riskReward`
- `sectorHotness`
- `executionFriction`

其中：
- `riskReward` 来自 `(high30 - entryPrice) / unitRisk` 的分段函数
- `sectorHotness` 基于行业热度分位映射（新闻降级时打 0.85 折）
- `executionFriction` 根据挂单与目标差量分段打分

### 3.5 动作判定（action）

按顺序判定：
1. `unitFailed` -> `no_trade`
2. `!passedLayerA && score >= 65` -> `hold_watch`
3. `!passedLayerA && score < 65` -> `no_trade`
4. `passedLayerA && (score < 72 || targetQty < 100)` -> `hold_watch`
5. `passedLayerA && score >= 72 && targetQty >= 100 && pendingBuyQty == 0` -> `open_buy`
6. 同上且 `pendingBuyQty > 0 && deltaQty > 0` -> `increase_buy`
7. 其他情况 -> `replace_buy`

## 4. 动作归因（actionReason）

`actionReason` 枚举：
- `single_exposure_limit`
- `capital_limit`
- `risk_limit`
- `unit_mismatch`
- `other`

当 `actionResult.reason = other` 时，MCP 再按数量约束补充归因：
- `targetQty <= 0 && symbolExposureQty <= 0` -> `single_exposure_limit`
- `targetQty <= 0 && capitalQty <= 0` -> `capital_limit`
- `targetQty <= 0 && riskQty <= 0` -> `risk_limit`
- 否则 `other`

## 5. Skill 当前承担的下单相关逻辑

skill 不做仓位/评分/下单数学计算，仅做：
- 读取 MCP 返回字段
- 动作与归因中文展示映射（展示层）
- 生成“可执行交易单”区块

可执行交易单规则：
- 仅过滤 `results[].action in {open_buy, increase_buy, replace_buy}`
- 空结果固定输出：`本批无可执行交易单（0条）`
- 不允许模型补算、补单、猜测委托参数

## 6. 当前“下单”的实际含义

当前流程输出的是“交易建议单（指令候选）”，不是自动落地券商委托。

证据：
- 工具只输出 JSON 结果（action/entryPrice/targetQty 等）
- skill 输出报告与可执行交易单文本
- 代码中没有“提交真实委托到券商 API”的下单执行器

## 7. 关键文件定位

- MCP 计算主逻辑：`/Users/zhangjianyong/project/z-mcp/stock-data-mcp/src/etf-batch-decide.ts`
- MCP 工具注册：`/Users/zhangjianyong/project/z-mcp/stock-data-mcp/src/index.ts`
- 类型定义：`/Users/zhangjianyong/project/z-mcp/stock-data-mcp/src/types.ts`
- skill 约束：`/Users/zhangjianyong/.openclaw/skills/etf-scanner/SKILL.md`
- skill 使用说明：`/Users/zhangjianyong/.openclaw/skills/etf-scanner/README.md`

## 8. 你最关心的落地点

如果目标是“给我可执行交易单”，当前判定标准就是：
- 只有 `action` 命中 `open_buy/increase_buy/replace_buy` 才进入交易单。
- `hold_watch/no_trade` 无论分数多高，都不会进入可执行交易单。

