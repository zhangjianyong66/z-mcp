# z-mcp search server

一个个人使用的 MCP search server。当前提供统一的 `web_search` 工具，通过参数选择搜索 provider，不做多源聚合。

## 功能

- `web_search`
  - 输入搜索关键词，返回结构化搜索结果
  - 支持 provider：`aliyun`、`baidu`、`ddg`
  - 支持可选参数：`provider`、`limit`、`timeout`
  - 未传 `provider` 时默认使用 `aliyun`

## 环境变量

复制 `.env` 并配置：

```bash
ALIYUN_WEBSEARCH_API_KEY=your_api_key
ALIYUN_WEBSEARCH_BASE_URL=https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp
BAIDU_API_KEY=your_api_key
BAIDU_WEBSEARCH_BASE_URL=https://qianfan.baidubce.com/v2/ai_search/web_search
```

说明：

- `ALIYUN_WEBSEARCH_API_KEY` 为阿里 provider 首选鉴权变量
- `DASHSCOPE_API_KEY` 和 `LLM_API_KEY` 仍可作为兼容兜底
- `ALIYUN_WEBSEARCH_BASE_URL` 默认值是 `https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp`
- `BAIDU_WEBSEARCH_BASE_URL` 默认值是 `https://qianfan.baidubce.com/v2/ai_search/web_search`
- `ddg` provider 默认无需鉴权
- 未配置对应 provider 的密钥时，调用该 provider 会返回明确错误
- 代码启动时会自动读取项目根目录下的 `.env`

## 安装

```bash
npm install
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
    "search": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/search-mcp/dist/index.js"],
      "env": {
        "ALIYUN_WEBSEARCH_API_KEY": "your_api_key",
        "ALIYUN_WEBSEARCH_BASE_URL": "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp",
        "BAIDU_API_KEY": "your_api_key",
        "BAIDU_WEBSEARCH_BASE_URL": "https://qianfan.baidubce.com/v2/ai_search/web_search"
      }
    }
  }
}
```

## 工具输入示例

```json
{
  "query": "Model Context Protocol",
  "provider": "aliyun",
  "limit": 5,
  "timeout": 30
}
```

百度示例：

```json
{
  "query": "TypeScript MCP server tutorial",
  "provider": "baidu",
  "limit": 5
}
```

DuckDuckGo 示例：

```json
{
  "query": "DuckDuckGo lite search example",
  "provider": "ddg",
  "limit": 5
}
```

返回结构示例：

```json
{
  "provider": "ddg",
  "query": "DuckDuckGo lite search example",
  "count": 2,
  "results": [
    {
      "title": "Example result",
      "url": "https://example.com",
      "snippet": "",
      "provider": "ddg"
    }
  ]
}
```
