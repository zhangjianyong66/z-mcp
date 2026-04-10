# z-mcp

个人使用的 MCP server 集合仓库。

当前模块：

- `image-mcp`
  - 图片相关能力
  - 首版提供 `describe_image` 工具，用于图片内容识别
  - 底层通过 OpenAI-compatible 多模态接口完成图像理解

## 目录结构

```text
z-mcp/
├── README.md
└── image-mcp/
```

## 已有模块

### image-mcp

路径：`image-mcp/`

功能：

- 支持图片 URL、本地文件路径、`data:image/...` 输入
- 返回结构化识别结果：`summary`、`objects`、`scene`、`visible_text`、`confidence`

模块说明见 [image-mcp/README.md](./image-mcp/README.md)。

## 后续扩展建议

后面可以继续按同样结构增加新模块，例如：

- `text-mcp`
- `search-mcp`
- `browser-mcp`

每个模块保持独立的 `package.json`、源码和说明文档，根目录只负责聚合和导航。
