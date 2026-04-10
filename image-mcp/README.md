# z-mcp image server

一个个人使用的 MCP image server。当前提供一个图片生成工具，基于阿里云百炼 `qwen-image` 同步接口。

## 功能

- `generate_image`
  - 输入文本提示词生成图片
  - 支持可选参数：`model`、`size`、`n`、`negative_prompt`、`watermark`
  - 返回百炼生成的临时图片 URL 列表

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
DASHSCOPE_API_KEY=your_api_key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com
DASHSCOPE_MODEL=qwen-image
```

说明：

- `DASHSCOPE_API_KEY` 为首选鉴权变量
- `LLM_API_KEY` 和 `LLM_MODEL` 仍可作为兼容兜底
- `DASHSCOPE_BASE_URL` 默认值是 `https://dashscope.aliyuncs.com`
- 代码启动时会自动读取项目根目录下的 `.env`

## 接口说明

- 工具内部调用百炼同步接口 `POST /api/v1/services/aigc/multimodal-generation/generation`
- 当前只实现 `qwen-image` 同步生图
- 返回的图片 URL 为百炼临时地址，通常有时效，不会自动下载到本地

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
        "DASHSCOPE_API_KEY": "your_api_key",
        "DASHSCOPE_BASE_URL": "https://dashscope.aliyuncs.com",
        "DASHSCOPE_MODEL": "qwen-image"
      }
    }
  }
}
```

## 工具输入示例

```json
{
  "prompt": "一只橘猫坐在木质窗台上，午后阳光，电影感摄影",
  "size": "1024*1024",
  "n": 1,
  "watermark": false
}
```
