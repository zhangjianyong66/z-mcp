#!/usr/bin/env bash
set -euo pipefail

CHROME_BIN="${CHROME_BIN:-}"
CDP_PORT="${CDP_PORT:-9222}"
CDP_ENDPOINT="http://127.0.0.1:${CDP_PORT}/json/version"
LOG_FILE="${LOG_FILE:-/tmp/cdp-browser-mcp-chrome.log}"
USER_DATA_DIR="${USER_DATA_DIR:-$HOME/.chrome-cdp}"
PROFILE_DIRECTORY="${PROFILE_DIRECTORY:-Default}"

default_chrome_candidates=(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
  "google-chrome"
  "google-chrome-stable"
  "chromium"
  "chromium-browser"
)

resolve_executable() {
  local candidate="$1"
  if [[ "$candidate" == */* ]]; then
    [[ -x "$candidate" ]] && printf '%s\n' "$candidate"
    return
  fi
  command -v "$candidate" 2>/dev/null || true
}

find_chrome_bin() {
  local candidate resolved
  if [[ -n "$CHROME_BIN" ]]; then
    resolved="$(resolve_executable "$CHROME_BIN")"
    [[ -n "$resolved" ]] && printf '%s\n' "$resolved"
    return
  fi

  for candidate in "${default_chrome_candidates[@]}"; do
    resolved="$(resolve_executable "$candidate")"
    if [[ -n "$resolved" ]]; then
      printf '%s\n' "$resolved"
      return
    fi
  done
}

print_chrome_not_found() {
  echo "Chrome executable not found."
  echo "Tried candidates:"
  if [[ -n "$CHROME_BIN" ]]; then
    echo "  $CHROME_BIN"
  else
    local candidate
    for candidate in "${default_chrome_candidates[@]}"; do
      echo "  $candidate"
    done
  fi
  echo "Set CHROME_BIN=/path/to/browser to specify Chrome or Chromium explicitly."
}

is_browser_running() {
  local process_names=(
    "Google Chrome"
    "Chromium"
    "chrome"
    "google-chrome"
    "google-chrome-stable"
    "chromium"
    "chromium-browser"
  )
  local process_name
  for process_name in "${process_names[@]}"; do
    if pgrep -x "$process_name" >/dev/null 2>&1; then
      return 0
    fi
  done
  return 1
}

if curl -fsS "$CDP_ENDPOINT" >/dev/null 2>&1; then
  echo "CDP already ready on :$CDP_PORT"
  echo "Endpoint: $CDP_ENDPOINT"
  exit 0
fi

RESOLVED_CHROME_BIN="$(find_chrome_bin || true)"

if [[ -z "$RESOLVED_CHROME_BIN" ]]; then
  print_chrome_not_found
  exit 1
fi

if is_browser_running; then
  echo "Chrome/Chromium is running but CDP :$CDP_PORT is not reachable."
  echo "Quit Chrome/Chromium and rerun, or relaunch it with --remote-debugging-port=$CDP_PORT."
  exit 1
fi

mkdir -p "$USER_DATA_DIR"

chrome_args=(
  --remote-debugging-port="$CDP_PORT"
  --user-data-dir="$USER_DATA_DIR"
  --profile-directory="$PROFILE_DIRECTORY"
)

"$RESOLVED_CHROME_BIN" "${chrome_args[@]}" >"$LOG_FILE" 2>&1 &
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
