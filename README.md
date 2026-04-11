# z-mcp

个人使用的 MCP server 集合仓库。

当前模块：

- `image-mcp`
  - 图片相关能力
  - 当前提供纯文本生图和参考图生图工具
  - 底层通过阿里云百炼 `qwen-image` 同步接口生成图片
- `search-mcp`
  - 联网搜索能力
  - 通过参数选择 `aliyun`、`baidu`、`ddg` 搜索 provider
  - 返回统一结构化搜索结果

## 目录结构

```text
z-mcp/
├── README.md
├── image-mcp/
└── search-mcp/
```

## 已有模块

### image-mcp

路径：`image-mcp/`

功能：

- 支持通过提示词生成图片
- 支持输入参考图生成新图片
- 返回百炼生成的临时图片 URL

模块说明见 [image-mcp/README.md](./image-mcp/README.md)。

### search-mcp

路径：`search-mcp/`

功能：

- 支持通过统一工具 `web_search` 进行联网搜索
- 调用时可选择 `aliyun`、`baidu`、`ddg` provider
- 不做多源聚合，返回统一结构化结果

模块说明见 [search-mcp/README.md](./search-mcp/README.md)。
