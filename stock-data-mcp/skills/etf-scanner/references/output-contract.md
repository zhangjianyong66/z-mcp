# ETF Scanner 输出协议（MCP-Only）

## 通用要求

- 首行固定：`以下为完整扫描报告（与 final_output.md 一致）`
- 必须完整输出七段正文（非中止场景）。
- 聊天完整输出为强制通过条件，禁止仅输出文件路径或摘要。
- 数值字段必须逐项来源于 MCP 返回。
- 禁止新增推导数值或组合口径结论。
- 必须输出 `可执行交易单` 结论：有单则表格，无单则固定空单语句。
- `action` 展示默认使用中文标签（不展示码值）；是否展示动作字段由“区块语义唯一性”决定。
- `actionReasons` 展示必须使用中文原因列表（按 MCP 返回顺序，不展示码值）。

## 聊天完整性严格校验

- 固定首行必须出现且仅出现一次。
- 非中止场景必须包含七段标题且顺序固定：
  1. `Scan Meta`
  2. `当前持有ETF（39池内）`
  3. `候选交易（新开买入/加仓买入/换仓买入）`
  4. `持有观察`
  5. `不交易`
  6. `可执行交易单（仅含新开买入/加仓买入/换仓买入）`
  7. `Failure Ledger`
- `可执行交易单` 必须给出表格或固定空单语句 `本批无可执行交易单（0条）`。
- 若聊天不完整，则判定失败，即使 artifact 文件齐全。

## 分段输出协议

- 当单条消息长度受限时，允许将最终报告拆分为多条 assistant 连续消息。
- 分段后拼接文本必须与完整报告严格一致，禁止改写、删节或先摘要后补全文。
- 分段输出期间不得插入与报告无关内容。

## 1) Scan Meta

必填：
- 扫描时间
- `run_id`
- 归档路径
- 调用参数与覆盖率
- universe 元信息：`universeSource=etf_universe`、`universeGeneratedAt`、`universeTotal`
- 持仓快照时间信息（仅记录，不做滞后判断）

## 2) 当前持有ETF（39池内）

- 仅输出“当次 universe（当前 39 只）内且当前持仓>0”的 ETF。
- 该区块准入不以 `action` 为前提。
- 允许与 `候选交易`、`持有观察`、`不交易` 区块重叠（同一 ETF 可同时出现）。
- 若当次 universe 内无持仓 ETF，必须输出空态语句，不得省略本区块。
- 该区块允许混合动作，始终展示动作字段（中文标签）。

## 3) 候选交易（新开买入/加仓买入/换仓买入）

每只必须包含：
- 标的标识与分数：`代码：symbol；名称：name；评分：score`
- `name` 来源固定为 `results[].name`；缺失或空值时展示：`名称：未知名称（MCP缺失）`
- 分数构成：`技术位置：technicalPosition｜风险收益：riskReward｜板块热度：sectorHotness｜总分：score`
- 趋势一句话（必须引用 `marketState.trend/trendZh`）
- 结构一句话（必须引用 `marketState.structurePass/structureReason/structureReasonZh`）
- 结构快照：`marketState.price/ma5/ma10/ma20` 与 `marketState.priceVsMa10Pct`
- 安全边际：`marketState.safetyMarginPct`（并标注阈值 4.00%）
- 动作展示按区块内动作唯一性决定：
  - 若区块内仅一种动作：省略每条动作字段，并在区块外固定输出：`本区块动作统一为：<中文动作>`。
  - 若区块内存在多种动作：展示每条动作字段（中文标签）。
- 参数（用户可见中文键）：`入场价：entryPrice`、`止损价：stopLoss`、`目标数量：targetQty`、`调整数量：deltaQty`
- 暴露（用户可见中文键）：`当前暴露：symbolExposure`、`暴露上限：symbolCap`、`暴露占比：symbolRatio`
- 限制因子：`actionReasons`
- 分数构成字段来源：`scoring.layerB.technicalPosition`、`scoring.layerB.riskReward`、`scoring.layerB.sectorHotness`、`scoring.total`

## 4) 持有观察

- 仅输出 `action=hold_watch` 的 ETF。
- 区块语义唯一，省略每条动作字段。
- 每个 ETF 必须展示标识行：`代码：symbol；名称：name`
- 每个 ETF 必须展示分数。
- 每个 ETF 必须展示分数构成（技术位置/风险收益/板块热度/总分）。
- 差距条件仅可引用 MCP 现有原因字段。

## 5) 不交易

- 仅输出 `action=no_trade` 的标的与限制因子。
- 区块语义唯一，省略每条动作字段。
- 每个 ETF 必须展示标识行：`代码：symbol；名称：name`
- 每个 ETF 必须展示分数。
- 每个 ETF 必须展示分数构成（技术位置/风险收益/板块热度/总分）。
- 每个 ETF 条目必须包含趋势与结构行，不允许省略。
- 与 `当前持有ETF（39池内）` 区块允许重叠（池内持仓且 `action=no_trade` 时可同时出现）。

## 归因中文化规则

- 展示格式：`中文1；中文2`
- 映射表：
  - `trend_not_tradeable` -> `趋势不可交易`
  - `structure_not_matched` -> `结构不匹配`
  - `insufficient_safety_margin` -> `安全边际不足（当前 {safetyMarginPct}% < 阈值 4.00%，差 {gapPct}%）`
  - `score_below_buy_threshold` -> `分数未达买入阈值`
  - `target_qty_below_lot` -> `目标数量不足一手`
  - `pending_order_already_sufficient` -> `已有挂单已满足目标数量`
  - `buy_signal_confirmed` -> `买入信号成立`
  - `unknown_reason` -> `未知原因（需排查）`
- 未命中映射：`未定义中文标签`
- 适用区块：`当前持有ETF（39池内）`、`候选交易`、`持有观察`、`不交易`、`可执行交易单`
- 该规则仅限展示层，本地不得改写 MCP 原始 `actionReasons`。
- `gapPct` 计算规则：`max(0,4.00-safetyMarginPct)`，展示保留 2 位小数。
- 禁止仅输出“安全边际不足”纯文本，必须输出“当前/阈值/差值”三段式。
- 同一 ETF 多原因并存时，`insufficient_safety_margin` 数值化文案优先置顶。
- 用户可见字段格式统一为：`中文键名：值`（全角冒号 `：`），禁止 `score=...`、`entryPrice=...` 等英文字段键。

## 动作中文化规则

- 展示格式：`中文动作`
- 映射表：
  - `open_buy` -> `新开买入`
  - `increase_buy` -> `加仓买入`
  - `replace_buy` -> `换仓买入`
  - `hold_watch` -> `持有观察`
  - `no_trade` -> `不交易`
- 未命中映射：`未定义中文标签`
- 适用区块：`当前持有ETF（39池内）`、`候选交易`、`持有观察`、`不交易`、`可执行交易单`
- 仅在需要展示动作字段时使用中文动作标签；区块语义唯一且规则要求省略时不展示动作字段。
- 该规则仅限展示层，本地不得改写 MCP 原始 `action`。

## 6) 可执行交易单

- 标题固定：`可执行交易单（仅含新开买入/加仓买入/换仓买入）`
- 过滤规则：仅从 `results[]` 选择 `action in {open_buy,increase_buy,replace_buy}`。
- 有可执行项：输出表格，字段固定为
  - `代码`
  - `名称`
  - `评分：score`
  - `入场价：entryPrice`
  - `止损价：stopLoss`
  - `目标数量：targetQty`
  - `调整数量：deltaQty`
  - `归因：中文`
- 若表内动作存在多种：增加 `动作` 列（仅中文标签）。
- 若表内动作仅一种：删除 `动作` 列，并在表外输出 `本批可执行交易单动作统一为：<中文动作>`。
- 无可执行项：固定输出 `本批无可执行交易单（0条）`。
- 排序：沿用 MCP `results[]` 原顺序。
- 精度：沿用 MCP 原值，不做四舍五入或再计算。

## 7) Failure Ledger

每条异常必须包含：
- 影响
- 处理
- 风险残留
- `errorCode`

中止场景：
- 仅输出错误报告
- 不输出交易建议

## Artifact 一致性（可选）

- `final_output.md` 为可选产物，默认可不生成。
- 若 `final_output.md` 存在，则其内容必须与聊天最终报告严格全文一致。
