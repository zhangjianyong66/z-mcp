# z-mcp minimax music server

MiniMax 音乐生成 MCP 模块，封装以下 API：

- `POST /v1/lyrics_generation`
- `POST /v1/music_generation`
- `POST /v1/music_cover_preprocess`

## Tools

- `generate_lyrics`: 提示词生成歌词
- `generate_music`: 基于 prompt 或歌词生成音乐（仅使用 POST 返回结果）
- `create_music_cover`: 翻唱工作流（preprocess + music generation）
- `generate_song_from_prompt`: 一键提示词到歌曲（先歌词后音乐）
  - 第一步调用 `lyrics_generation`，第二步调用 `music_generation`
  - 会落盘音频文件与歌词文本文件（包含 `Title: <song_title>`）
  - 可选参数：`output_format`、`audio_setting`
- `generate_instrumental_music`: 一键生成纯音乐（仅 music generation）
  - 必填参数：`song_title`（由调用方指定，用于命名落盘文件）
  - 固定 `is_instrumental=true`
  - 可选参数：`output_format`、`audio_setting`

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

- 文件名规则：`{timestamp}_{taskId}_{songTitle}_{index}.{ext}`
- 冲突自动追加序号

`generate_song_from_prompt` 会额外写入歌词文本文件；`generate_instrumental_music` 仅写入音频文件。

## Dev

```bash
npm install
npm run build
npm test
```
