# ETF Scanner 测试用例（MCP-Only）

## 全局断言

- 结论、理由、风险、挂单建议四类信息齐全。
- 所有交易建议都能映射回 MCP 字段。
- 中止/风控失败场景不得输出可执行挂单。

## Case 1: 可交易路径

输入：`action=open_buy|increase_buy|replace_buy`，全局门禁通过。  
期望：输出含最小字段的挂单建议（symbol/side/action/quantity/priceType/rationale）。

## Case 2: 观察路径

输入：`action=hold_watch`。  
期望：输出观察理由与风险状态，不输出可执行挂单。

## Case 3: 不交易路径

输入：`action=no_trade`。  
期望：输出不交易原因与解除条件，不输出可执行挂单。

## Case 4: 全局中止

输入：`globalChecks.status=aborted`。  
期望：仅输出阻断原因，不输出任何可执行挂单。

## Case 5: 关键字段缺失

输入：缺失 `action` 或 `targetQty/deltaQty` 等关键字段。  
期望：标记不可执行并说明缺失字段，不输出挂单建议。

## Case 6: Pending 单冲突

输入：同标的已有 `pending` 买单。  
期望：先输出冲突处理建议，再决定是否给新单；不得重复挂单。
