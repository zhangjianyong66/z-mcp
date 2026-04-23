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
  - 支持分页，`limit` 兼容为 `pageSize` 别名
  - 数据源：`AkShare stock_board_industry_summary_ths`

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

## 安装

```bash
npm install
npx playwright install chromium
python3 -m pip install akshare
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
  "page": 1,
  "pageSize": 20,
  "sortBy": "hot",
  "timeout": 20
}
```

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
- `page`
- `pageSize`
- `total`
- `count`
- `hasMore`
- `newsScoreDegraded`
- `data`

第一版不提供自动降级、多市场个股能力、持久缓存或报告生成。
