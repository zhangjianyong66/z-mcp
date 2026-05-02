# z-mcp video server

基于阿里云 DashScope（万相图生视频）实现的 MCP 视频模块。

## 功能

- `generate_video_from_first_frame`
  - 输入首帧图像生成视频（wan2.7/happyhorse i2v）
- `generate_video_from_frames`
  - 输入首帧+尾帧图像生成视频（wan2.7 i2v 或 legacy kf2v）

两个工具都支持：

- 支持分辨率：`480P` / `720P` / `1080P`
- 支持可选参数：`prompt`、`duration`、`prompt_extend`、`watermark`
- 支持可选参数：`save_to_local`（默认 `true`）、`output_filename`
- 支持输入：`http(s)`、`oss://`、`file://`、`data:image/...;base64`
- `file://` 和 `data:` 会自动上传为临时 `oss://` 后再调用模型
- 内部自动创建异步任务并轮询到完成
- 返回 `task_id`、`task_status`、`video_url`，以及本地落盘信息 `local_file_path`、`local_file_size_bytes`、`local_file_sha256`

## 环境变量

```bash
DASHSCOPE_API_KEY=your_api_key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com
DASHSCOPE_VIDEO_MODEL=wan2.7-i2v-2026-04-25
VIDEO_MCP_OUTPUT_DIR=/absolute/path/to/video-output
```

说明：

- `DASHSCOPE_API_KEY` 必填
- `DASHSCOPE_BASE_URL` 默认 `https://dashscope.aliyuncs.com`
- `DASHSCOPE_VIDEO_MODEL` 未配置时默认 `wan2.2-kf2v-flash`
- `VIDEO_MCP_OUTPUT_DIR` 未配置时默认 `<video-mcp>/outputs/video-mcp`

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
    "video": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/video-mcp/dist/index.js"],
      "env": {
        "DASHSCOPE_API_KEY": "your_api_key",
        "DASHSCOPE_BASE_URL": "https://dashscope.aliyuncs.com",
        "DASHSCOPE_VIDEO_MODEL": "wan2.7-i2v-2026-04-25"
      }
    }
  }
}
```

## 工具输入示例

`generate_video_from_first_frame`:

```json
{
  "first_frame_url": "https://wanx.alicdn.com/material/20250318/first_frame.png",
  "model": "wan2.7-i2v-2026-04-25",
  "prompt": "写实风格，一只小黑猫好奇地仰望天空，镜头逐渐升高。",
  "duration": 5,
  "resolution": "720P",
  "save_to_local": true,
  "output_filename": "first-frame-demo.mp4",
  "prompt_extend": true,
  "watermark": true
}
```

`generate_video_from_frames`:

```json
{
  "first_frame_url": "https://wanx.alicdn.com/material/20250318/first_frame.png",
  "last_frame_url": "https://wanx.alicdn.com/material/20250318/last_frame.png",
  "model": "wan2.7-i2v-2026-04-25",
  "prompt": "写实风格，一只黑色小猫好奇地看向天空，镜头从平视逐渐上升，最后俯拍它的好奇眼神。",
  "duration": 5,
  "resolution": "720P",
  "save_to_local": true,
  "output_filename": "first-last-demo.mp4",
  "prompt_extend": true,
  "watermark": true
}
```

## 输出说明

- `video_url` 是临时地址（通常有效期 24 小时）。
- 默认会自动下载到本地目录（`VIDEO_MCP_OUTPUT_DIR` 或默认目录）。
