# stock-data-mcp：`etf_batch_decide` 计算下沉实施计划（可直接实现）

## Summary
在 `~/project/z-mcp/stock-data-mcp` 新增 MCP 工具 `etf_batch_decide`，把 ETF 扫描中的核心计算（单位校验、单 ETF 暴露、仓位、评分、动作与归因）统一收敛到服务端返回的结构化 JSON。  
调用方仅需传 `symbols`（必传），账户快照默认由服务端内部读取，不再由调用方传资金/持仓参数。

## Key Changes
- 新增 MCP 工具 `etf_batch_decide`
  - 入参：`symbols`（1-20，必传）
  - 可选：`days=60`、`source=xueqiu`、`timeout=20`、`riskPct=0.01`、`singleEtfExposureCapPct=0.2`
  - 账户数据：内部调用 `getPortfolioAndOrders`（调用方不传账户字段）
- 新增内部计算模块（src）
  - `unit-guard.ts`：单位一致性校验；任一标的失败触发 `UNIT_MISMATCH`，全局中止
  - `risk-engine.ts`：计算 `entryPrice/stopLoss/riskQty/capitalQty/symbolExposure/symbolCap/symbolRatio/symbolExposureQty/targetQty/deltaQty`
  - `scoring-engine.ts`：Layer A + Layer B、总分、候选/观察名单、排序
  - `decision-errors.ts`：统一错误码与错误结构（含中止/部分失败/快照缺失等）
- 扩展类型定义（`types.ts`）
  - 新增 `EtfBatchDecideInput`、`EtfBatchDecideResponse`
  - 单标的结果包含：`unitCheck`、`exposureMetrics`、`positioning`、`scoring`、`action`、`actionReason`
  - `actionReason` 限定：`single_exposure_limit|capital_limit|risk_limit|unit_mismatch|other`
- 结果协议（纯 JSON）
  - 顶层：`generatedAt`、`runMeta`、`snapshotMeta`、`globalChecks`、`results`、`watchlist`、`errors`
  - `globalChecks.status`：`ok|aborted`；中止时带 `abortReason`
  - `snapshotMeta`：`snapshotUpdatedAt`、`snapshotAgeMs`、`snapshotStalenessWarning`
  - 禁止输出组合暴露字段（如 `portfolioExposure*`）
- MCP 注册与文档
  - `index.ts` 增加 zod schema、tool handler、`runTool(...)` 日志打点接入
  - handler 返回 `JSON.stringify(...)`
  - `README.md` 补充工具说明、入参示例、出参示例、默认自动读取快照说明，并强调 `symbols` 必传、由 MCP 负责计算

## Test Plan
- 单元测试
  - `unit-guard`：份/元口径异常触发 `UNIT_MISMATCH` 且 `globalChecks.status=aborted`
  - `risk-engine`：校验 `symbolExposure/symbolCap/symbolRatio` 与 `targetQty/deltaQty`
  - `scoring-engine`：Layer A/LB 评分、阈值分层、排序稳定性
- 集成测试（`runEtfBatchDecide`）
  - 正常输入 + 有快照：返回完整 `results/watchlist` 和结构化元信息
  - 无快照：结构化错误并中止（不产出交易动作）
  - 滞后快照：`snapshotStalenessWarning=true`（告警但不自动中止）
- 回归用例（关键业务约束）
  - 总资金 `32180`、多只各约 `2000`：不得误判“合计超单只 20% 上限”
  - 单只暴露仅在 `> 6436`（32180 * 20%）时触发 `single_exposure_limit`

## Assumptions
- `symbols` 必传，且第一阶段不新增“自动读取 skill universe”。
- 第一阶段只交付 MCP 工具与测试；skill 侧调用切换放后续迭代。
- 评分和动作仍遵循当前 v2.2.1 规则口径，服务端负责可复用结构化输出，不在该阶段重做策略体系。
