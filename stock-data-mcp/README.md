# z-mcp stock data server

一个个人使用的 MCP 股票数据 server。当前提供 ETF 行情工具和行业板块汇总工具。

## 功能

- `etf_quote`
  - 获取 ETF 最新行情
  - 支持代码格式：`159930`、`510300`、`SZ159930`、`SH510300`
  - 支持 provider：`eastmoney`、`xueqiu`
  - 默认 provider：`eastmoney`
- `etf_kline`
  - 获取 ETF 日 K 数据
  - 支持 provider：`eastmoney`、`xueqiu`
  - 默认 provider：`eastmoney`
- `etf_analyze`
  - 返回 ETF 技术分析结果
  - 包含 `MA5`、`MA10`、`MA20`、`30日最高`、`30日最低`、趋势标签
  - 默认 provider：`xueqiu`
- `etf_batch_quote`
  - 批量获取多个 ETF 最新行情
  - 最多支持 20 个 symbol
  - 部分失败时返回 `results`（成功列表）和 `errors`（失败列表）
  - 默认 provider：`xueqiu`
- `etf_batch_kline`
  - 批量获取多个 ETF 日 K 数据
  - 最多支持 20 个 symbol
  - 部分失败时返回 `results` 和 `errors`
  - 默认 provider：`xueqiu`
- `etf_batch_analyze`
  - 批量分析多个 ETF
  - 包含 `MA5`、`MA10`、`MA20`、`30日最高`、`30日最低`、趋势标签
  - 最多支持 20 个 symbol
  - 部分失败时返回 `results` 和 `errors`
  - 默认 provider：`xueqiu`
- `etf_batch_decide`
  - 批量计算 ETF 决策结果（评分、仓位、动作归因）
  - 最多支持 40 个 symbol
  - 自动读取 `get_portfolio_and_orders` 的账户快照
  - 返回结构化 JSON：`globalChecks/results/watchlist/errors`
  - 每个 `result` 关键字段：`symbol`、`action`、`actionReasons`、`positioning`、`scoring`、`marketState`
  - 部分失败时返回 `results` 和 `errors`；全局门禁失败时中止
  - 每个 `result` 新增 `marketState`（趋势/结构/均线偏离/安全边际）
  - 触发 `UNIT_MISMATCH` 或账户快照缺失时全局中止
- `etf_list`
  - 获取 ETF 列表
  - 默认按涨幅从高到低排序，也可以切换到跌幅、成交量、成交额、换手率排序
  - 支持分页和 `fetchAll=true` 全量拉取
  - `limit` 是兼容旧调用的别名，等同于 `pageSize`
  - 返回更完整的列表字段，包括 `open`、`high`、`low`、`prevClose`、`turnoverRate`、`peRatio`、`pbRatio`、`totalMarketValue` 等信息
  - 默认优先解析东财 `fund_etf` 网格页对应的数据，失败时自动回退到上交所 `SSE` 官方列表接口
  - 也可以显式指定 `source=auto|eastmoney|sse`
  - `SSE` 路径会额外返回 `fundAbbr`、`fundExpansionAbbr`、`companyName`、`companyCode`、`indexName`、`listingDate`、`category`、`scale`
  - 返回里会附带 `sourceUrl`，方便你直接回到对应页面核对数据
  - 还会附带 `sourceQuery`，便于调试当前列表请求的分页和排序参数
- `sector_list`
  - 获取同花顺行业板块汇总
  - 支持 `sortBy=gainers|losers|hot`
  - `hot` 使用新闻热度与行情热度混合评分
  - 默认返回全量数据（无分页参数）
  - 输出为 JSON 对象数组（`data`）
  - MCP 文本输出默认使用压缩 JSON（无缩进换行）
  - 数据源：`AkShare stock_board_industry_summary_ths`

所有工具默认返回压缩 JSON 文本；如需可读格式，请在调用方自行 prettify。

## 环境变量

复制 `.env.example` 并按需配置：

```bash
XUEQIU_COOKIE=xq_a_token=your_token; xq_r_token=your_token
XUEQIU_USER_AGENT=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36
```

说明：

- `eastmoney` 默认无需鉴权
- `xueqiu` 优先使用 `XUEQIU_COOKIE`
- 未配置 `XUEQIU_COOKIE` 时，server 会尝试使用 Playwright 无头访问雪球并自动获取 Cookie
- 如果自动获取失败，错误信息会提示安装或初始化 Playwright 浏览器
- 代码启动时会自动读取模块目录下的 `.env`
- 日志默认写到 `/tmp/openclaw/stock-data-mcp.log`
- 如果需要改路径，可以设置 `STOCK_DATA_MCP_LOG_FILE=/your/path/stock-data-mcp.log`
- `sector_list` 依赖本机 `python3` 和 `akshare` 包
- 如需自定义脚本位置，可设置 `AKSHARE_SECTOR_SCRIPT_PATH`
- 如需显式指定 Python 解释器，可设置 `AKSHARE_PYTHON_BIN`（例如 `.venv/bin/python`）

## 安装

```bash
npm install
npx playwright install chromium
python3 -m pip install akshare
```

推荐（更稳定）使用虚拟环境安装 akshare，避免 Node 子进程与 pip 环境不一致：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip akshare
export AKSHARE_PYTHON_BIN=.venv/bin/python
```

## 开发

```bash
npm run dev
```

## 构建

```bash
npm run build
```

## MCP 配置示例

```json
{
  "mcpServers": {
    "stock-data": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/stock-data-mcp/dist/index.js"],
      "env": {
        "XUEQIU_COOKIE": "xq_a_token=your_token; xq_r_token=your_token"
      }
    }
  }
}
```

## 工具输入示例

`etf_quote`:

```json
{
  "symbol": "159930",
  "source": "eastmoney",
  "timeout": 15
}
```

`etf_kline`:

```json
{
  "symbol": "SH510300",
  "days": 30
}
```

`etf_analyze`:

```json
{
  "symbol": "SZ159930",
  "source": "xueqiu",
  "days": 30
}
```

`etf_batch_quote`:

```json
{
  "symbols": ["159930", "510300"],
  "source": "xueqiu",
  "timeout": 15
}
```

`etf_batch_kline`:

```json
{
  "symbols": ["159930", "510300"],
  "days": 30,
  "timeout": 15
}
```

`etf_batch_analyze`:

```json
{
  "symbols": ["159930", "510300"],
  "days": 30,
  "timeout": 15
}
```

`etf_batch_decide`:

```json
{
  "symbols": ["159930", "510300"],
  "days": 60,
  "timeout": 20,
  "riskPct": 0.01,
  "singleEtfExposureCapPct": 0.2,
  "themeExposureCapPct": 0.2
}
```

- `etf_batch_decide` 当前固定使用新版 `v2` 评分口径，不再暴露版本选择参数。
- `riskRewardModel` 已废弃；传入会返回参数错误。

`etf_list`:

```json
{
  "page": 1,
  "pageSize": 20,
  "sortBy": "gainers",
  "fetchAll": false,
  "source": "auto"
}
```

`sector_list`:

```json
{
  "sortBy": "hot",
  "timeout": 20
}
```

- 每次调用 `sector_list` 后，服务会自动将当次“热门榜（hot）”全量刷新写入数据库表 `sector_hot_latest`（与 `sortBy` 入参无关）。

## 返回结构示例

```json
{
  "source": "eastmoney",
  "symbol": "159930",
  "normalizedSymbol": "SZ159930",
  "generatedAt": "2026-04-12T03:30:00.000Z",
  "data": {
    "symbol": "159930",
    "name": "能源ETF",
    "market": "SZ",
    "normalizedSymbol": "SZ159930",
    "secid": "0.159930",
    "price": 1.234,
    "changePercent": 1.56,
    "changeAmount": 0.02,
    "open": 1.21,
    "high": 1.25,
    "low": 1.2,
    "prevClose": 1.214,
    "volume": 12345678,
    "amount": 45678901,
    "turnoverRate": 0.82,
    "volumeRatio": 1.13,
    "amplitude": 2.44,
    "peRatio": 14.2,
    "pbRatio": 1.67,
    "totalMarketValue": 1234567890,
    "circulationMarketValue": 987654321,
    "change60d": 8.13,
    "changeYtd": 14.9
  }
}
```

`etf_analyze` 会返回：

- `quote`
- `indicators`
- `recentKlines`

`etf_batch_quote` 返回：

- `source`
- `total`
- `successCount`
- `errorCount`
- `results`（每个 symbol 的行情数据）
- `errors`（失败的 symbol、错误信息，以及可选的 `code` / `retryable`）

`etf_batch_kline` 返回：

- `source`
- `total`
- `successCount`
- `errorCount`
- `results`（每个 symbol 的 K 线数据）
- `errors`（失败项同上）

`etf_batch_analyze` 返回：

- `source`
- `total`
- `successCount`
- `errorCount`
- `results`（每个 symbol 的 `quote`、`indicators`、`recentKlines`）
- `errors`（失败项同上）

`etf_batch_decide` 返回（顶层字段）：

- `globalChecks`（全局门禁检查结果）
- `results`（成功计算结果列表）
- `watchlist`（观察名单）
- `errors`（失败项列表）

`etf_batch_decide` 返回（每个 `result` 关键字段）：

- `symbol`
- `positioning`（`entryPrice/stopLoss/targetQty/deltaQty`）
- `scoring`（LayerA/LayerB/total）
- `action`、`actionReasons`
  - `actionReasons` 常见值：
    - `trend_not_tradeable`
    - `structure_not_matched`
    - `insufficient_safety_margin`
    - `risk_not_definable`
    - `insufficient_exposure_room`
    - `single_exposure_limit`
    - `theme_exposure_limit`
    - `capital_limit`
    - `risk_limit`
    - `unit_mismatch`
    - `score_below_buy_threshold`
    - `target_qty_below_lot`
    - `pending_order_already_sufficient`
    - `buy_signal_confirmed`（买入动作正向归因）
    - `unknown_reason`（防御兜底，用于排障监控）
- `marketState`
  - `trend`、`trendZh`
    - `trend` 可取：`bullish`（多头）、`bearish`（空头）、`rangebound`（震荡）、`insufficient_data`（数据不足）
  - `price/ma5/ma10/ma20/high30/low30`
  - `priceVsMa5Pct`、`priceVsMa10Pct`、`safetyMarginPct`
  - `structurePass`、`structureReason`、`structureReasonZh`

说明：返回字段以实际响应为准，新增字段遵循向后兼容。

`etf_list` 返回：

- `sortBy`
- `fetchAll`
- `page`
- `pageSize`
- `limit`
- `sourceUrl`
- `sourceQuery`
- `total`
- `count`
- `hasMore`
- `data`

`sector_list` 返回：

- `source`
- `sortBy`
- `total`
- `newsScoreDegraded`
- `data`

`sector_hot_latest`（数据库最新热门行业快照表）字段：
- `sector_name`（主键）
- `change_percent/up_count/down_count/amount/net_inflow`
- `leader_stock/leader_latest_price/leader_change_percent`
- `market_score/news_score/hot_score`
- `source/generated_at/updated_at`

`sector_list` 出参 JSON Schema：

- `docs/json-schemas/sector_list.response.schema.json`

第一版不提供自动降级、多市场个股能力、持久缓存或报告生成。

## 持仓与交易单工具

- `save_portfolio_info`
  - 保存/更新持仓信息（全量覆盖）
  - 字段：`totalCapital`、`availableCapital`、`positions`、`updatedAt?`
  - `positions` 字段：`symbol`、`name`、`quantity`、`costPrice`、`currentPrice`、`marketValue`
  - `marketValue` 以传入值为准，同时会校验 `quantity*currentPrice`，不一致时返回 `warnings`
- `save_trade_orders`
  - 保存/更新交易单信息（全量覆盖）
  - 每笔字段：`orderId?`、`symbol`、`name`、`side`、`quantity`、`orderTime`、`status`
  - 自动失效：按 `Asia/Shanghai` 自然日，`pending` 挂单当天未成交次日自动转 `expired`
- `get_portfolio_and_orders`
  - 获取持仓与交易单
  - 返回前会执行自动失效
  - 若从未保存过数据，返回友好提示：`当前无持仓信息，请先保存持仓或交易单信息`

新增环境变量：

- `DB_HOST`：MySQL 主机，默认 `mysql.zhangjianyong.top`
- `DB_PORT`：MySQL 端口，默认 `3306`
- `DB_NAME`：数据库名，默认 `web_projects_hub`
- `DB_USER`：数据库用户，默认 `web_projects_hub_app`
- `DB_PASS`：数据库密码（必填，无默认值）

输入示例：

`save_portfolio_info`:

```json
{
  "totalCapital": 100000,
  "availableCapital": 60000,
  "positions": [
    {
      "symbol": "510300",
      "name": "沪深300ETF",
      "quantity": 1000,
      "costPrice": 4.0,
      "currentPrice": 4.2,
      "marketValue": 4200
    }
  ]
}
```

`save_trade_orders`:

```json
{
  "orders": [
    {
      "orderId": "ord-001",
      "symbol": "510300",
      "name": "沪深300ETF",
      "side": "buy",
      "quantity": 100,
      "orderTime": "2026-04-30T10:15:00+08:00",
      "status": "pending"
    }
  ]
}
```

## ETF 门禁与打分规则（`etf_batch_decide`）

本节对应当前实现口径，用于解释 `LayerA`（门禁）与 `LayerB`（打分）。

### LayerA 门禁（通过条件）

`layerA.passed=true` 表示以下检查均通过：

1. 趋势可交易
- 仅 `bullish`（多头）或 `rangebound`（震荡）可通过趋势门。
- 其他趋势触发 `trend_not_tradeable`。

2. 结构通过
- 多头：结构直接通过。
- 震荡：需满足 `price <= ma5`，或 `abs(price-ma10)/price <= 0.015`。
- 否则触发 `structure_not_matched`。

3. 安全边际达标
- 安全边际：`(high30-price)/high30`。
- 小于 `0.04`（4%）触发 `insufficient_safety_margin`。

4. 风险可定义
- 必须 `stopLoss < entryPrice`，否则触发 `risk_not_definable`。

5. 单标的暴露空间足够
- 若 `symbolExposureQty < 100`（一手）触发 `insufficient_exposure_room`。

6. 同主题暴露空间足够
- 同一 `theme`（来自 `etf_universe.theme`）按总分降序竞争主题额度。
- 若 `themeExposureQty <= 0`，触发 `theme_exposure_limit`。

7. 单位一致性检查通过
- 若出现单位异常，触发 `unit_mismatch`，并进入全局中止路径。

### LayerB 打分（总分）

总分计算：

`total = technicalPosition + riskReward + sectorHotness + executionFriction * 0.1`

并在实现中执行 `min(100, total)` 封顶。

1. `technicalPosition`（技术位置分）
- 趋势基分：多头 `20`，震荡 `12`。
- 位置分：
  - `price <= ma5` 加 `12`
  - 否则若 `abs(price-ma10)/price <= 0.015` 加 `8`
  - 否则加 `0`
- 安全边际分：`safetyMarginScore`，在 4%~12% 区间线性映射（约 3~12 分）。

2. `riskReward`（风险收益分）
- `rr = (high30-entryPrice)/(entryPrice-stopLoss)`。
- `rr < 1` 记 `0`；`1~2` 线性（10->22）；`2~3` 线性（22->30）；`>=3` 记 `30`。

3. `sectorHotness`（板块热度分）
- 优先按 ETF->板块映射匹配当次 `sector_list(hot)` 的 `hotScore`（主映射，失败再备选）。
- 再按分位映射到离散档位：`20 / 16 / 12 / 7 / 3`。
- 若 `newsScoreDegraded=true`，该项乘 `0.85`。

4. `executionFriction`（执行摩擦信号）
- 根据挂单状态、目标增减、暴露余量等离散打分（常见 10/7/4/1）。
- 该信号仅以 `0.1` 权重参与总分，且默认不在 `layerB` 对外单列返回。

### 评分标尺版本

- 当前固定使用 `v2` 口径：提高技术分与风险收益分中段斜率，并放宽板块热度分位切档，用于缓解分数整体偏低。

### 动作与门禁/分数关系

1. 单位不匹配：直接 `no_trade`，并触发全局中止。
2. 门禁未通过：
- 分数 `>=63`：`hold_watch`
- 否则：`no_trade`
3. 门禁通过后：
- 分数 `<70` 或 `targetQty < 100`：`hold_watch`
- 否则：
  - `pendingBuyQty=0`：`open_buy`
  - `deltaQty>0`：`increase_buy`
  - 其他：`replace_buy`
