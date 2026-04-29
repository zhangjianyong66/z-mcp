# z-mcp minimax music server

MiniMax 音乐生成 MCP 模块，封装以下 API：

- `POST /v1/lyrics_generation`
- `POST /v1/music_generation`
- `POST /v1/music_cover_preprocess`

## Tools

- `generate_lyrics`: 提示词生成歌词
- `generate_music`: 基于 prompt 或歌词生成音乐（自动轮询任务结果）
- `create_music_cover`: 翻唱工作流（preprocess + music generation）
- `generate_song_from_prompt`: 一键提示词到歌曲（先歌词后音乐）
  - 默认会将歌曲名和歌词写入同目录文本文件（`.txt`）

## Env

复制 `.env.example` 到 `.env`：

```bash
MINIMAX_API_KEY=your_key
MINIMAX_BASE_URL=https://api.minimaxi.com
MINIMAX_MUSIC_MODEL=music-2.6
MINIMAX_OUTPUT_DIR=outputs/minimax-music
MINIMAX_POLL_INTERVAL_MS=3000
MINIMAX_POLL_TIMEOUT_MS=180000
```

## 音频落盘

当返回 `audio_hex`/`audio` 时，默认自动写入本地目录：

- 文件名规则：`{timestamp}_{taskId}_{index}.{ext}`
- 冲突自动追加序号

`generate_song_from_prompt` 还会写入歌词文本文件，内容格式：

- 第一行：`Title: <song_title>`
- 空行
- 歌词正文

## Dev

```bash
npm install
npm run build
npm test
```
