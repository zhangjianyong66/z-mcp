# z-mcp image server

一个个人使用的 MCP image server。首版只提供一个图片内容识别工具，底层通过 OpenAI-compatible 多模态接口完成图像理解。

## 功能

- `describe_image`
  - 输入图片 URL、本地图片路径，或 `data:image/...` 格式的 data URL
  - 调用在线多模态模型理解图片
  - 返回结构化结果：`summary`、`objects`、`scene`、`visible_text`、`confidence`

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
```

说明：

- `OPENAI_BASE_URL` 支持任何 OpenAI-compatible 服务
- 如果你用的是 DashScope / OpenRouter / 其他兼容端点，只需要改 `OPENAI_BASE_URL` 和模型名
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

下面以本地 `node` 启动为例：

```json
{
  "mcpServers": {
    "image": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "your_api_key",
        "OPENAI_BASE_URL": "https://api.openai.com/v1",
        "OPENAI_MODEL": "gpt-4.1-mini"
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
