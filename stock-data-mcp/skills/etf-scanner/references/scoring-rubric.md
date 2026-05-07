# ETF Scanner 评分消费规范（MCP-Only）

本文档用于约束 skill 如何读取评分结果，不定义评分计算方法。

## 计算责任边界

- 评分、闸门、排序由 `etf_batch_decide` 生成。
- skill 只读取并渲染，不做本地打分或阈值推导。

## 必需字段

每只标的至少需要：
- `score`
- `scoring`（若 MCP 提供分项）
- `action`
- `actionReasons`
- `unitCheck`
- `exposureMetrics`

## 输出分组

- 候选清单：依据 MCP 返回的候选结果与排序。
- 观察名单：依据 MCP 返回的观察结果。
- 不执行清单：依据 MCP 返回动作与归因。

## 渲染要求

- 分数、分项、排序位次全部直接引用 MCP 字段。
- 差距条件仅可复述 MCP 已给出的原因字段。
- 不得生成新的评分中间量或比较结论。

## 错误处理

- 评分关键字段缺失：写入 `MISSING_REQUIRED_FIELD`。
- 全局中止：不输出候选与交易建议。
