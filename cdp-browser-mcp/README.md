# cdp-browser-mcp

A generic MCP server for controlling an already running Chrome via CDP.

## Features

- `cdp_health`: check CDP endpoint status
- `start_chrome_cdp`: start/check Chrome CDP locally (headed mode)
- `list_tabs`: list current tabs
- `new_tab`: open new tab
- `navigate`: navigate tab to URL
- `click`: click element
- `type_text`: type into element
- `evaluate_js`: run JS in page context
- `screenshot`: save screenshot to file
- `close_tab`: close tab

## Prerequisites

Install Google Chrome or Chromium. The `start_chrome_cdp` tool can start a
local headed browser with remote debugging enabled on macOS and Ubuntu/Linux.

You can also start it manually:

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-cdp"

# Ubuntu/Linux
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-cdp"
```

## Install

```bash
cd /home/zhangjianyong/project/z-mcp/cdp-browser-mcp
npm install
npm run build
```

## Run

```bash
CDP_ENDPOINT=http://127.0.0.1:9222 npm start
```

## Browser startup

The bundled startup script auto-detects these browser commands/paths:

- macOS: Google Chrome, Chromium
- Ubuntu/Linux: `google-chrome`, `google-chrome-stable`, `chromium`, `chromium-browser`

Override detection when needed:

```bash
CHROME_BIN=/path/to/chrome ./scripts/start-chrome-cdp.sh
```

If Chrome/Chromium is already running but `http://127.0.0.1:9222` is not
reachable, the script exits conservatively. Quit the running browser and rerun,
or relaunch it manually with `--remote-debugging-port=9222`.

## OpenClaw MCP config example

```json
{
  "mcp": {
    "servers": {
      "cdp-browser": {
        "command": "/home/zhangjianyong/.nvm/versions/node/v22.22.0/bin/node",
        "args": [
          "/home/zhangjianyong/project/z-mcp/cdp-browser-mcp/dist/index.js"
        ],
        "env": {
          "CDP_ENDPOINT": "http://127.0.0.1:9222",
          "CDP_ACTION_TIMEOUT_MS": "10000"
        }
      }
    }
  }
}
```
