#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
SCRIPT="$ROOT_DIR/scripts/start-chrome-cdp.sh"

fail() {
  echo "not ok - $1" >&2
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" == *"$needle"* ]] || fail "expected output to contain: $needle"
}

test_autodetects_linux_chrome_from_path() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' RETURN

  cat >"$tmpdir/google-chrome" <<'FAKE_CHROME'
#!/usr/bin/env bash
printf '%s\n' "$@" >"$FAKE_CHROME_ARGS_FILE"
exit 0
FAKE_CHROME
  chmod +x "$tmpdir/google-chrome"

  cat >"$tmpdir/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
exit 22
FAKE_CURL
  chmod +x "$tmpdir/curl"

  cat >"$tmpdir/pgrep" <<'FAKE_PGREP'
#!/usr/bin/env bash
exit 1
FAKE_PGREP
  chmod +x "$tmpdir/pgrep"

  cat >"$tmpdir/sleep" <<'FAKE_SLEEP'
#!/usr/bin/env bash
exit 0
FAKE_SLEEP
  chmod +x "$tmpdir/sleep"

  local output status args_file
  args_file="$tmpdir/chrome-args.txt"
  set +e
  output="$(
    env -i \
      HOME="$tmpdir/home" \
      PATH="$tmpdir:/usr/bin:/bin" \
      FAKE_CHROME_ARGS_FILE="$args_file" \
      CDP_PORT=9333 \
      LOG_FILE="$tmpdir/chrome.log" \
      bash "$SCRIPT" 2>&1
  )"
  status=$?
  set -e

  [[ "$status" -eq 1 ]] || fail "expected timeout exit status 1, got $status"
  assert_contains "$output" "Chrome launched but CDP is not ready yet."
  [[ -f "$args_file" ]] || fail "expected auto-detected google-chrome to be launched"

  local args
  args="$(cat "$args_file")"
  assert_contains "$args" "--remote-debugging-port=9333"
  assert_contains "$args" "--user-data-dir=$tmpdir/home/.chrome-cdp"
  assert_contains "$args" "--profile-directory=Default"
}

test_missing_chrome_lists_candidates() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' RETURN

  cat >"$tmpdir/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
exit 22
FAKE_CURL
  chmod +x "$tmpdir/curl"

  local output status
  set +e
  output="$(
    env -i \
      HOME="$tmpdir/home" \
      PATH="$tmpdir:/usr/bin:/bin" \
      CHROME_BIN="$tmpdir/missing-chrome" \
      bash "$SCRIPT" 2>&1
  )"
  status=$?
  set -e

  [[ "$status" -eq 1 ]] || fail "expected missing Chrome exit status 1, got $status"
  assert_contains "$output" "Chrome executable not found"
  assert_contains "$output" "Tried candidates:"
  assert_contains "$output" "Set CHROME_BIN=/path/to/browser"
}

test_ready_cdp_does_not_require_chrome_binary() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' RETURN

  cat >"$tmpdir/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
exit 0
FAKE_CURL
  chmod +x "$tmpdir/curl"

  local output status
  set +e
  output="$(
    env -i \
      HOME="$tmpdir/home" \
      PATH="$tmpdir:/usr/bin:/bin" \
      CHROME_BIN="$tmpdir/missing-chrome" \
      CDP_PORT=9444 \
      bash "$SCRIPT" 2>&1
  )"
  status=$?
  set -e

  [[ "$status" -eq 0 ]] || fail "expected ready CDP exit status 0, got $status"
  assert_contains "$output" "CDP already ready on :9444"
  assert_contains "$output" "Endpoint: http://127.0.0.1:9444/json/version"
}

test_running_browser_without_cdp_fails_conservatively() {
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' RETURN

  cat >"$tmpdir/google-chrome" <<'FAKE_CHROME'
#!/usr/bin/env bash
exit 0
FAKE_CHROME
  chmod +x "$tmpdir/google-chrome"

  cat >"$tmpdir/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
exit 22
FAKE_CURL
  chmod +x "$tmpdir/curl"

  cat >"$tmpdir/pgrep" <<'FAKE_PGREP'
#!/usr/bin/env bash
exit 0
FAKE_PGREP
  chmod +x "$tmpdir/pgrep"

  local output status
  set +e
  output="$(
    env -i \
      HOME="$tmpdir/home" \
      PATH="$tmpdir:/usr/bin:/bin" \
      bash "$SCRIPT" 2>&1
  )"
  status=$?
  set -e

  [[ "$status" -eq 1 ]] || fail "expected running browser exit status 1, got $status"
  assert_contains "$output" "Chrome/Chromium is running but CDP :9222 is not reachable."
  assert_contains "$output" "Quit Chrome/Chromium and rerun"
}

test_mcp_entrypoint_does_not_hardcode_zsh() {
  if grep -F 'execFile("/bin/zsh"' "$ROOT_DIR/src/index.ts" >/dev/null; then
    fail "MCP entrypoint must not hardcode /bin/zsh"
  fi
}

test_autodetects_linux_chrome_from_path
test_missing_chrome_lists_candidates
test_ready_cdp_does_not_require_chrome_binary
test_running_browser_without_cdp_fails_conservatively
test_mcp_entrypoint_does_not_hardcode_zsh

echo "ok - start-chrome-cdp"
