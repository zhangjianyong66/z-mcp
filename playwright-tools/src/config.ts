import type { BrowserRunOptions, PlaywrightRuntimeConfig, ViewportSize } from "./types.js";

const DEFAULT_VIEWPORT: ViewportSize = { width: 1440, height: 900 };

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseViewport(value: string | undefined): ViewportSize {
  if (!value) {
    return DEFAULT_VIEWPORT;
  }
  const match = value.trim().match(/^(\d+)x(\d+)$/i);
  if (!match) {
    throw new Error(`invalid viewport format: ${value}. Expected WIDTHxHEIGHT`);
  }
  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
}

export function getPlaywrightRuntimeConfig(overrides: BrowserRunOptions = {}): PlaywrightRuntimeConfig {
  const envViewport = parseViewport(process.env.PLAYWRIGHT_VIEWPORT);
  const timeoutMs = Number(process.env.PLAYWRIGHT_TIMEOUT_MS ?? "30000");

  return {
    headless: overrides.headless ?? parseBoolean(process.env.PLAYWRIGHT_HEADLESS, true),
    channel: overrides.channel ?? process.env.PLAYWRIGHT_CHANNEL,
    executablePath: overrides.executablePath ?? process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    userAgent: overrides.userAgent ?? process.env.PLAYWRIGHT_USER_AGENT,
    viewport: overrides.viewport ?? envViewport,
    timeoutMs: overrides.timeoutMs ?? (Number.isFinite(timeoutMs) ? timeoutMs : 30000),
    waitUntil:
      overrides.waitUntil ??
      (process.env.PLAYWRIGHT_WAIT_UNTIL as PlaywrightRuntimeConfig["waitUntil"]) ??
      "domcontentloaded"
  };
}
