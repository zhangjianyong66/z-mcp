# ETF Scanner 降级与终止规范（MCP-Only）

## 总原则

1. 主流程仅使用 `stock-data__etf_batch_decide` 产出结论。
2. 诊断工具仅用于排障与证据补采，不得覆写主结论。
3. 所有降级与终止依据必须来自 MCP 返回字段与错误码。

## 可继续场景

- 批量部分失败：继续处理成功标的，并在 `Failure Ledger` 披露失败明细。
- 资讯降级：继续流程，并明确标记降级风险。

## Universe 来源失败

- `stock-data__etf_universe` 失败或返回空池。
- 处理：终止主流程，记录 `UNIVERSE_SOURCE_UNAVAILABLE`。
- 禁止回退到 `references/etf_universe.md` 作为运行时输入。

## 终止场景

- `globalChecks.status=aborted`
- `UNIT_MISMATCH`
- 工具超时
- 账户快照缺失
- 关键字段缺失且无法形成安全输出

终止后要求：
- 仅输出结构化错误报告
- 不输出交易执行建议

## 无候选场景

- 输出“当前无合格建仓机会”
- 输出观察名单与差距条件
- 不输出可执行买入清单
