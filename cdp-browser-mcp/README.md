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

Chrome must run with remote debugging enabled:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222
```

## Install

```bash
cd /Users/zhangjianyong/project/z-mcp/cdp-browser-mcp
npm install
npm run build
```

## Run

```bash
CDP_ENDPOINT=http://127.0.0.1:9222 npm start
```

## OpenClaw MCP config example

```json
{
  "mcp": {
    "servers": {
      "cdp-browser": {
        "command": "/Users/zhangjianyong/.nvm/versions/node/v22.22.1/bin/node",
        "args": [
          "/Users/zhangjianyong/project/z-mcp/cdp-browser-mcp/dist/index.js"
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
