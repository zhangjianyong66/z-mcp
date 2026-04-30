# z-mcp minimax music server

MiniMax 音乐生成 MCP 模块，封装以下 API：

- `POST /v1/lyrics_generation`
- `POST /v1/music_generation`
- `POST /v1/music_cover_preprocess`

## Tools

- `generate_lyrics`: 提示词生成歌词
- `generate_music`: 基于 prompt 或歌词生成音乐（仅使用 POST 返回结果）
- `create_music_cover`: 翻唱工作流（preprocess + music generation）
- `generate_song_from_prompt`: 一键提示词到歌曲（仅调用 music generation）
  - 模型默认读取环境变量：`MINIMAX_MUSIC_MODEL`
  - 使用 `with_lyrics` 单参数控制是否生成带歌词歌曲（内部映射为 `lyrics_optimizer` + `is_instrumental`）
  - 可选参数：`output_format`、`audio_setting`、`with_lyrics`

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

`generate_song_from_prompt` 仅写入音频文件，不再写入歌词文本文件。

## Dev

```bash
npm install
npm run build
npm test
```
