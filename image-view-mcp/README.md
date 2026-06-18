# z-mcp image-view server

一个个人使用的 MCP image-view server，专门提供图片视觉理解能力。当前基于 DashScope 百炼多模态同步接口，适用于图片描述、元素识别、截图理解和多图对比等通用视觉问答场景。

## 功能

- `analyze_image`
  - 输入 `1-3` 张图片和一个自然语言问题/分析指令
  - 图片支持公网 URL、本地文件路径和 `data:image/...;base64`
  - 使用 `VISION_MODEL` 指定支持图片输入的百炼多模态模型，例如 `qwen3.7-plus`
  - 返回 JSON 文本，包含 `provider`、`model`、`prompt`、`answer`、`attempts`，以及可选 `requestId`

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
DASHSCOPE_API_KEY=your_api_key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com
VISION_MODEL=qwen3.7-plus
```

如需配置多模型回退链：

```bash
VISION_MODEL_CHAIN='[
  {
    "provider": "dashscope",
    "apiKey": "your_primary_key",
    "baseURL": "https://dashscope.aliyuncs.com",
    "model": "qwen3.7-plus"
  },
  {
    "provider": "dashscope",
    "apiKey": "your_secondary_key",
    "baseURL": "https://dashscope.aliyuncs.com",
    "model": "your_secondary_vision_model"
  }
]'
```

也可以把回退链放到 JSON 文件：

```bash
VISION_MODEL_CHAIN=file:/absolute/path/to/vision-chain.json
# 或相对路径（相对于进程工作目录）
VISION_MODEL_CHAIN=file:./configs/vision-chain.json
```

说明：

- `VISION_MODEL_CHAIN` 存在时优先使用，按数组顺序尝试候选模型
- `VISION_MODEL_CHAIN` 支持内联 JSON 字符串或 `file:` 文件路径
- `DASHSCOPE_API_KEY` 必填，除非使用每个链条项里的 `apiKey`
- `DASHSCOPE_BASE_URL` 默认值是 `https://dashscope.aliyuncs.com`
- `VISION_MODEL` 必须是支持图片输入的多模态模型；纯文本模型不能完成视觉理解

## 接口说明

- 工具内部调用 DashScope 百炼同步接口：`POST /api/v1/services/aigc/multimodal-generation/generation`
- 请求内容按图片在前、文本提示词在后的顺序发送
- 当前版本返回自然语言分析结果，不提供目标框、区域坐标或严格 OCR schema

## 自动回退规则

- 会触发回退的情况：
  - 网络错误
  - HTTP 非 2xx，例如 `429`、`500`
  - provider 返回成功响应但没有文本答案
- 不会触发回退的情况：
  - 输入参数不合法
  - 本地图片文件读取失败
  - `data:image/...` 格式错误
  - 本地文件不是图片

## 安装

```bash
npm install
```

## 开发

```bash
npm run dev
```

## 验证

```bash
npm run check
npm test
npm run build
```

## MCP 客户端配置示例

```json
{
  "mcpServers": {
    "image-view": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/image-view-mcp/dist/index.js"],
      "env": {
        "DASHSCOPE_API_KEY": "your_api_key",
        "DASHSCOPE_BASE_URL": "https://dashscope.aliyuncs.com",
        "VISION_MODEL": "qwen3.7-plus"
      }
    }
  }
}
```

## 最小调用示例

```json
{
  "prompt": "请描述图片中的主要内容，并提取关键信息。",
  "images": [
    "/absolute/path/to/image.png"
  ]
}
```
