# z-mcp

个人使用的 MCP（Model Context Protocol）服务集合仓库，按模块拆分维护，便于按需启用。

## 项目概览

本仓库提供多类 MCP 能力：

- 图像生成与理解
- 联网搜索与财经热点
- ETF/板块数据查询与分析
- 飞书群聊管理
- 待办计划管理（SQLite）
- 华为手机消息推送
- 浏览器自动化（Playwright / CDP）
- 音乐生成（MiniMax）
- 小红书只读检索（基于 CDP）

## 仓库结构

```text
z-mcp/
├── README.md
├── cdp-browser-mcp/
├── feishu-mcp/
├── huawei-phone-push-mcp/
├── image-mcp/
├── mcp-cli/
├── minimax-music-mcp/
├── playwright-tools/
├── search-mcp/
├── stock-data-mcp/
├── todo-mcp/
├── video-mcp/
└── xiaohongshu-mcp/
```

## 模块矩阵

| 模块 | 主要能力 | 核心工具/命令 | 额外依赖 | 说明 |
|---|---|---|---|---|
| `image-mcp` | 生图、参考图编辑、图片理解 | `generate_image` `edit_image` `analyze_image` | DashScope API Key | [README](./image-mcp/README.md) |
| `video-mcp` | 首尾帧图生视频 | `generate_video_from_frames` | DashScope API Key | [README](./video-mcp/README.md) |
| `search-mcp` | 通用联网搜索、财经热点 | `web_search` `finance_hotnews` | 可选阿里/百度密钥 | [README](./search-mcp/README.md) |
| `stock-data-mcp` | ETF 行情/K 线/分析/列表、行业板块 | `etf_*` `sector_list` | Playwright、Python+akshare（板块） | [README](./stock-data-mcp/README.md) |
| `huawei-phone-push-mcp` | 华为手机推送与记录查询 | `push_to_huawei_phone` `get_push_history` | 推送鉴权码 | [README](./huawei-phone-push-mcp/README.md) |
| `feishu-mcp` | 飞书群聊管理 | `create_chat` `rename_chat` `delete_chat` 等 | 飞书应用凭证 | [README](./feishu-mcp/README.md) |
| `todo-mcp` | 计划/任务/子任务管理 | `create_plan` `create_task` `create_subtask` 等 | SQLite 文件路径 | [README](./todo-mcp/README.md) |
| `cdp-browser-mcp` | 通用 Chrome CDP 控制 | `cdp_health` `new_tab` `navigate` `click` 等 | 本机 Chrome | [README](./cdp-browser-mcp/README.md) |
| `xiaohongshu-mcp` | 小红书只读能力（登录/搜索/详情） | `check_login_status` `search_feeds` `get_feed_detail` | 依赖 `cdp-browser-mcp` | [README](./xiaohongshu-mcp/README.md) |
| `minimax-music-mcp` | 歌词生成、音乐生成、翻唱 | `generate_lyrics` `generate_music` `create_music_cover` 等 | MiniMax API Key | [README](./minimax-music-mcp/README.md) |
| `playwright-tools` | 本地网页自动化工具包 | `open` `snapshot`（CLI） | Playwright 浏览器 | [README](./playwright-tools/README.md) |
| `mcp-cli` | MCP 调试与冒烟测试 | `inspect` `list-tools` `call-tool` | 无 | [README](./mcp-cli/README.md) |

## 快速开始

### 1) 通用前置

- Node.js 20+（建议 22+）
- npm 10+
- macOS/Linux/WSL 均可

按模块可能还需要：

- Playwright 浏览器（`npx playwright install chromium`）
- Python 3 + `akshare`（`stock-data-mcp` 的 `sector_list`）

### 2) 安装模块依赖

按需进入模块目录安装：

```bash
cd image-mcp && npm install
cd ../search-mcp && npm install
cd ../stock-data-mcp && npm install
```

如果模块有测试/类型检查脚本，可先执行：

```bash
npm run check
npm test
```

### 3) 本地开发运行

大多数模块支持：

```bash
npm run dev
```

需要生产方式时：

```bash
npm run build
npm start
```

## 环境变量总览（按模块）

以下仅列关键项，完整配置以各模块 README 为准。

- `image-mcp`
  - 必需：`DASHSCOPE_API_KEY`
  - 常用：`DASHSCOPE_BASE_URL` `DASHSCOPE_MODEL` `VISION_MODEL`
- `video-mcp`
  - 必需：`DASHSCOPE_API_KEY`
  - 常用：`DASHSCOPE_BASE_URL` `DASHSCOPE_VIDEO_MODEL`
- `search-mcp`
  - 可选（provider 对应启用）：`ALIYUN_WEBSEARCH_API_KEY` `BAIDU_API_KEY`
- `stock-data-mcp`
  - 常用：`XUEQIU_COOKIE`
  - 可选：`STOCK_DATA_MCP_LOG_FILE` `AKSHARE_PYTHON_BIN`
- `huawei-phone-push-mcp`
  - 必需：`HUAWEI_PUSH_AUTH_CODE`
- `feishu-mcp`
  - 必需：`FEISHU_APP_ID` `FEISHU_APP_SECRET`
- `todo-mcp`
  - 必需：`TODO_MCP_DB_FILE`
- `cdp-browser-mcp`
  - 常用：`CDP_ENDPOINT`
- `xiaohongshu-mcp`
  - 必需：`XHS_CDP_MCP_ARGS`
  - 常用：`XHS_CDP_ENDPOINT` `XHS_AUTO_START_CHROME`
- `minimax-music-mcp`
  - 必需：`MINIMAX_API_KEY`
  - 常用：`MINIMAX_BASE_URL` `MINIMAX_MUSIC_MODEL` `MINIMAX_OUTPUT_DIR`

## MCP 客户端配置示例

### 示例 1：接入搜索 + 股票数据

```json
{
  "mcpServers": {
    "search": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/search-mcp/dist/index.js"],
      "env": {
        "ALIYUN_WEBSEARCH_API_KEY": "your_api_key"
      }
    },
    "stock-data": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/stock-data-mcp/dist/index.js"],
      "env": {
        "XUEQIU_COOKIE": "xq_a_token=...; xq_r_token=..."
      }
    }
  }
}
```

### 示例 2：接入 cdp-browser + 小红书

```json
{
  "mcpServers": {
    "cdp-browser": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/cdp-browser-mcp/dist/index.js"],
      "env": {
        "CDP_ENDPOINT": "http://127.0.0.1:9222"
      }
    },
    "xiaohongshu-lite": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/xiaohongshu-mcp/dist/index.js"],
      "env": {
        "XHS_CDP_MCP_COMMAND": "node",
        "XHS_CDP_MCP_ARGS": "[\"/absolute/path/to/z-mcp/cdp-browser-mcp/dist/index.js\"]",
        "XHS_CDP_ENDPOINT": "http://127.0.0.1:9222"
      }
    }
  }
}
```

## 用 mcp-cli 做联调

`mcp-cli` 用于快速验证本仓库内 MCP 服务：

```bash
cd mcp-cli
npm install

# 查看 server 能力
npm run dev -- inspect image

# 查看工具列表
npm run dev -- list-tools search

# 调用工具
npm run dev -- call-tool stock-data etf_quote --input '{"symbol":"159930"}'
```

## 常见排障

- 鉴权错误
  - 先检查对应模块的必填环境变量是否已注入。
- Playwright 相关报错
  - 执行 `npx playwright install chromium`，并确认系统依赖完整。
- `sector_list` 失败
  - 检查 `python3` 与 `akshare` 是否安装在当前可执行环境；必要时设置 `AKSHARE_PYTHON_BIN`。
- CDP 连接失败
  - 确认 Chrome 以 remote debugging 启动，且 `CDP_ENDPOINT` 可访问。
- Tool 名找不到
  - 先用 `mcp-cli list-tools <server>` 获取当前真实暴露工具名。

## 模块状态与维护约定

- 本仓库主要面向个人使用场景，模块迭代可能较快。
- 不同模块的稳定性和兼容策略可能不同，生产接入前建议固定 commit 并做回归。
- 新增模块建议至少提供以下文档字段：
  - 功能说明
  - 环境变量（必填/可选）
  - 本地运行步骤
  - MCP 配置示例
  - 最小调用示例
