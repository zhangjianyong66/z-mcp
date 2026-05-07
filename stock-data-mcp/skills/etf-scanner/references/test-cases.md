# ETF Scanner 测试用例（MCP-Only）

全局断言（适用于全部场景）：
- 必须检查最终 assistant 聊天输出，不得仅校验 artifact 文件。
- 非中止场景：聊天输出必须包含固定首行与七段正文（顺序一致）。
- 中止场景：聊天仅输出错误报告，不输出交易建议。

## Case 1: 正常路径

输入：ETF 池可用、主工具成功、账户快照完整。
期望：输出候选/观察/失败三类结果，结构完整。
聊天断言：七段正文完整，且包含可执行交易单表格或空单固定语句。

## Case 2: 部分失败

输入：主工具返回成功与失败并存。
期望：继续处理成功标的，并完整披露失败明细。
聊天断言：成功标的仍出现在候选/观察/执行区块，失败明细进入 `Failure Ledger`。

## Case 3: 账户缺失

输入：账户快照缺失。
期望：立即终止，不输出交易建议。
聊天断言：仅错误报告结构，不含可执行交易单建议。

## Case 4: 资讯降级

输入：`newsScoreDegraded=true`。
期望：继续输出并显式披露降级风险。
聊天断言：七段完整且风险披露存在。

## Case 5: 无候选

输入：无标的进入候选结果。
期望：输出观察名单，不输出可执行买入项。
聊天断言：`可执行交易单` 区块固定输出 `本批无可执行交易单（0条）`。

## Case 6: 挂单冲突

输入：存在 pending 买单且动作需调整。
期望：正确分流为增挂或替换，并给出参数引用。
聊天断言：`Execution Deltas` 与 `可执行交易单` 动作及参数均直接引用 MCP 返回值。

## Case 7: 关键字段缺失

输入：任一标的缺少关键输出字段。
期望：标记 `MISSING_REQUIRED_FIELD`，不输出该标的执行建议。
聊天断言：异常标的仅在错误区块披露，不进入交易建议。

## Case 8: artifact-only should fail

输入：`final_output.md` 等文件存在，但聊天仅输出路径/摘要或缺失完整正文。
期望：判定失败。

## Case 9: chat-only should pass

输入：未生成 `final_output.md`，但聊天完整输出符合输出协议。
期望：判定通过。

## Case 10: chunked-chat should pass

输入：聊天输出因长度限制被拆分为多条连续消息。
期望：拼接后文本完整，顺序正确，判定通过。

## Case 11: chat-file mismatch should fail

输入：存在 `final_output.md`，但其内容与聊天最终报告不一致。
期望：判定失败。

## Case 11.5: universe source unavailable should fail

输入：`stock-data__etf_universe` 调用失败或返回空池。
期望：主工具不调用，`failure_ledger` 记录 `UNIVERSE_SOURCE_UNAVAILABLE`。

## Case 12: outside-universe should fail (preflight)

输入：计划调用列表中混入一个不在 MCP `stock-data__etf_universe` 返回集合内的 symbol。
期望：Preflight 失败，主工具不调用，`failure_ledger` 记录 `UNIVERSE_INTEGRITY_FAILED`。
聊天断言：仅输出失败报告，不输出交易建议。

## Case 13: duplicate-across-batches should fail (preflight)

输入：同一 symbol 出现在两个批次。
期望：检出 `duplicateAcrossBatches`，运行终止，记录 `UNIVERSE_INTEGRITY_FAILED`。
聊天断言：仅输出失败报告，不输出交易建议。

## Case 14: missing-universe-symbol should fail (pre/postflight)

输入：计划调用遗漏 universe 中的至少一只标的。
期望：检出 `missingUniverseSymbols`（或 `actualMissingUniverse`），运行失败。
聊天断言：仅输出失败报告，不输出交易建议。

## Case 15: holding-driven-watchlist should pass

输入：当次 universe（39 只）中存在持仓 ETF，且其 `action` 混合为 `open_buy`/`increase_buy`/`hold_watch`/`no_trade`。
期望：所有“池内持仓>0”ETF 进入 `当前持有ETF（39池内）`；`action=hold_watch` 进入 `持有观察`。
聊天断言：存在“当前持有ETF”与“候选交易/持有观察/不交易”重叠标的时判定通过。

## Case 16: empty-holding-watchlist should pass

输入：当次 universe（39 只）内无任何持仓 ETF。
期望：`当前持有ETF（39池内）` 区块输出空态语句，区块仍保留。
聊天断言：七段结构完整，`当前持有ETF（39池内）` 非省略。
