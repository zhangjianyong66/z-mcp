# z-mcp

个人使用的 MCP server 集合仓库。

当前模块：

- `image-mcp`
  - 图片相关能力
  - 当前提供纯文本生图、参考图生图和图片理解工具
  - 底层通过阿里云百炼 `qwen-image` 同步接口生成图片
- `search-mcp`
  - 联网搜索能力
  - 通过参数选择 `aliyun`、`baidu`、`ddg` 搜索 provider
  - 返回统一结构化搜索结果
- `stock-data-mcp`
  - ETF 数据能力
  - 当前提供 ETF 最新行情、历史 K 线、技术分析和 ETF 列表工具
  - provider 包括 `eastmoney` 与 `xueqiu`，其中 `etf_list` 默认解析东财 `fund_etf` 网格页数据，并支持 `eastmoney` / `sse` 自动回退，返回中会带 `sourceUrl` 和 `sourceQuery`
- `mcp-cli`
  - MCP 协议调试与冒烟测试工具
  - 方便列出 tools、调用 tool、查看 server capabilities
- `playwright-tools`
  - 独立的 Playwright 浏览器自动化工具包
  - 方便打开页面、抓取快照、保存截图和复用浏览器配置
- `xiaohongshu-mcp`
  - 小红书 MCP 服务
  - 作为 Git 子模块接入，路径为 `xiaohongshu-mcp/`

模块说明见 [mcp-cli/README.md](./mcp-cli/README.md)。

## 目录结构

```text
z-mcp/
├── README.md
├── image-mcp/
├── search-mcp/
├── stock-data-mcp/
├── mcp-cli/
├── playwright-tools/
└── xiaohongshu-mcp/
```

## 已有模块

### image-mcp

路径：`image-mcp/`

功能：

- 支持通过提示词生成图片
- 支持输入参考图生成新图片
- 支持输入图片进行通用视觉问答和内容理解
- 返回百炼生成的临时图片 URL

模块说明见 [image-mcp/README.md](./image-mcp/README.md)。

### search-mcp

路径：`search-mcp/`

功能：

- 支持通过统一工具 `web_search` 进行联网搜索
- 调用时可选择 `aliyun`、`baidu`、`ddg` provider
- 不做多源聚合，返回统一结构化结果

模块说明见 [search-mcp/README.md](./search-mcp/README.md)。

### stock-data-mcp

路径：`stock-data-mcp/`

功能：

- 支持通过 `etf_quote` 获取 ETF 最新行情
- 支持通过 `etf_kline` 获取 ETF 日 K 数据
- 支持通过 `etf_analyze` 获取 ETF 技术分析
- 支持通过 `etf_list` 获取 ETF 列表

模块说明见 [stock-data-mcp/README.md](./stock-data-mcp/README.md)。

### playwright-tools

路径：`playwright-tools/`

功能：

- 提供可复用的 Playwright 浏览器封装
- 支持打开页面、抓取文本和 HTML 快照
- 支持保存截图和统一配置浏览器参数

模块说明见 [playwright-tools/README.md](./playwright-tools/README.md)。

### xiaohongshu-mcp

路径：`xiaohongshu-mcp/`

功能：

- 小红书 MCP 服务
- 提供搜索、浏览、发布等小红书相关能力
- 作为独立 Git 子模块维护

模块说明见 [xiaohongshu-mcp/README.md](./xiaohongshu-mcp/README.md)。
