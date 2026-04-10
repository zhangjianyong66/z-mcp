# z-mcp image server

一个个人使用的 MCP image server。首版只提供一个图片内容识别工具，当前支持：

- `openai-compatible`
- `anthropic-compatible`

## 功能

- `describe_image`
  - 输入图片 URL、本地图片路径，或 `data:image/...` 格式的 data URL
  - 调用在线多模态模型理解图片
  - 返回结构化结果：`summary`、`objects`、`scene`、`visible_text`、`confidence`

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
LLM_API_STYLE=openai-compatible
LLM_API_KEY=your_api_key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini
```

说明：

- `LLM_API_STYLE` 支持 `openai-compatible` 和 `anthropic-compatible`
- `LLM_BASE_URL` 支持任何对应协议的兼容服务
- 如果你用的是 DashScope / OpenRouter / 其他 OpenAI-compatible 端点，只需要改 `LLM_BASE_URL` 和模型名
- 代码启动时会自动读取项目根目录下的 `.env`
- 仍兼容 `OPENAI_*` 和 `ANTHROPIC_*` 变量名

## Anthropic-compatible 说明

Anthropic-compatible 路径会调用 `POST /v1/messages`。

注意：

- 这表示 server 现在支持 Anthropic 协议兼容
- 但并不代表所有 Anthropic-compatible provider 都支持图片输入
- 对于 MiniMax 的 Anthropic-compatible 配置，当前会直接返回明确错误，因为该兼容接口目前不支持 image blocks

如果你要做图片识别，优先使用支持视觉输入的 OpenAI-compatible provider。

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

下面以本地 `node` 启动为例：

```json
{
  "mcpServers": {
    "image": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/image-mcp/dist/index.js"],
      "env": {
        "LLM_API_STYLE": "openai-compatible",
        "LLM_API_KEY": "your_api_key",
        "LLM_BASE_URL": "https://api.openai.com/v1",
        "LLM_MODEL": "gpt-4.1-mini"
      }
    }
  }
}
```

Anthropic-compatible 示例：

```json
{
  "mcpServers": {
    "image": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/image-mcp/dist/index.js"],
      "env": {
        "LLM_API_STYLE": "anthropic-compatible",
        "LLM_API_KEY": "your_api_key",
        "LLM_BASE_URL": "https://api.anthropic.com",
        "LLM_MODEL": "claude-3-7-sonnet-latest",
        "ANTHROPIC_VERSION": "2023-06-01"
      }
    }
  }
}
```

## 工具输入示例

```json
{
  "image": "/absolute/path/to/demo.png",
  "prompt": "请识别图片中的主体、场景和可见文字"
}
```
