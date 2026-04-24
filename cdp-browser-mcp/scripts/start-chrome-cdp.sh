#!/bin/zsh
set -euo pipefail

CHROME_BIN="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
CDP_PORT="${CDP_PORT:-9222}"
CDP_ENDPOINT="http://127.0.0.1:${CDP_PORT}/json/version"
LOG_FILE="${LOG_FILE:-/tmp/cdp-browser-mcp-chrome.log}"
USER_DATA_DIR="${USER_DATA_DIR:-$HOME/.chrome-cdp}"
PROFILE_DIRECTORY="${PROFILE_DIRECTORY:-Default}"

if [[ ! -x "$CHROME_BIN" ]]; then
  echo "Chrome executable not found: $CHROME_BIN"
  exit 1
fi

if curl -fsS "$CDP_ENDPOINT" >/dev/null 2>&1; then
  echo "CDP already ready on :$CDP_PORT"
  echo "Endpoint: $CDP_ENDPOINT"
  exit 0
fi

if pgrep -x "Google Chrome" >/dev/null 2>&1; then
  echo "Google Chrome is running but CDP :$CDP_PORT is not reachable."
  echo "Quit Chrome and rerun, or relaunch Chrome with --remote-debugging-port=$CDP_PORT."
  exit 1
fi

mkdir -p "$USER_DATA_DIR"

chrome_args=(
  --remote-debugging-port="$CDP_PORT"
  --user-data-dir="$USER_DATA_DIR"
  --profile-directory="$PROFILE_DIRECTORY"
)

"$CHROME_BIN" "${chrome_args[@]}" >"$LOG_FILE" 2>&1 &
chrome_pid=$!

for _ in {1..20}; do
  if curl -fsS "$CDP_ENDPOINT" >/dev/null 2>&1; then
    if ! kill -0 "$chrome_pid" >/dev/null 2>&1; then
      echo "Chrome reached CDP briefly but process exited."
      echo "Check log: $LOG_FILE"
      exit 1
    fi
    echo "System Chrome started with CDP on :$CDP_PORT"
    echo "Endpoint: $CDP_ENDPOINT"
    echo "User data dir: $USER_DATA_DIR"
    echo "PID: $chrome_pid"
    echo "Log: $LOG_FILE"
    exit 0
  fi
  sleep 1
done

echo "Chrome launched but CDP is not ready yet."
echo "Check log: $LOG_FILE"
exit 1
