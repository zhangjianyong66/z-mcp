# z-mcp stock data server

一个个人使用的 MCP ETF 数据 server。当前只聚焦 ETF，提供最新行情、历史 K 线、技术分析和 ETF 列表四个工具。

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
  - 当前固定使用 `eastmoney`

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

## 安装

```bash
npm install
npx playwright install chromium
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
  "limit": 20
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
    "price": 1.234,
    "changePercent": 1.56,
    "changeAmount": 0.02,
    "open": 1.21,
    "high": 1.25,
    "low": 1.2,
    "prevClose": 1.214,
    "volume": 12345678,
    "amount": 45678901
  }
}
```

`etf_analyze` 会返回：

- `quote`
- `indicators`
- `recentKlines`

第一版不提供自动降级、多市场个股能力、持久缓存或报告生成。
