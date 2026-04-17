import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPlaywrightRuntimeConfig } from "./config.js";
import type {
  BrowserRunOptions,
  BrowserSession,
  OpenPageResult,
  SnapshotResult
} from "./types.js";

function getDefaultBrowserRoot(): string {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    return process.env.PLAYWRIGHT_BROWSERS_PATH;
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  }
  return path.join(os.homedir(), ".cache", "ms-playwright");
}

function pickHighestVersionDirectory(root: string, prefix: string): string | undefined {
  if (!fs.existsSync(root)) {
    return undefined;
  }

  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => {
      const suffix = Number(entry.name.slice(prefix.length));
      return Number.isFinite(suffix) ? { name: entry.name, version: suffix } : null;
    })
    .filter((entry): entry is { name: string; version: number } => entry !== null)
    .sort((left, right) => right.version - left.version);

  return entries[0]?.name;
}

function detectChromiumExecutablePath(headless: boolean): string | undefined {
  const root = getDefaultBrowserRoot();
  const headlessDir = pickHighestVersionDirectory(root, "chromium_headless_shell-");
  if (headless && headlessDir) {
    const candidate = path.join(root, headlessDir, "chrome-headless-shell-mac-x64", "chrome-headless-shell");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const chromiumDir = pickHighestVersionDirectory(root, "chromium-");
  if (chromiumDir) {
    const candidate = path.join(root, chromiumDir, "chrome-mac-x64", "Chromium.app", "Contents", "MacOS", "Chromium");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

async function launchSession(options: BrowserRunOptions = {}): Promise<BrowserSession> {
  const config = getPlaywrightRuntimeConfig(options);
  const executablePath = config.executablePath ?? detectChromiumExecutablePath(config.headless);
  const browser = await chromium.launch({
    headless: config.headless,
    channel: executablePath ? undefined : config.channel,
    executablePath
  });
  const context = await browser.newContext({
    viewport: config.viewport,
    userAgent: config.userAgent,
    javaScriptEnabled: true
  });
  const page = await context.newPage();
  page.setDefaultTimeout(config.timeoutMs);
  return { browser, context, page };
}

export async function withBrowser<T>(
  fn: (session: BrowserSession) => Promise<T>,
  options: BrowserRunOptions = {}
): Promise<T> {
  const session = await launchSession(options);
  try {
    return await fn(session);
  } finally {
    await session.context.close();
    await session.browser.close();
  }
}

function countLinks(html: string): number {
  const matches = html.match(/<a\b/gi);
  return matches ? matches.length : 0;
}

export async function openPage(url: string, options: BrowserRunOptions = {}): Promise<OpenPageResult> {
  const config = getPlaywrightRuntimeConfig(options);
  return withBrowser(async ({ page }) => {
    await page.goto(url, { waitUntil: config.waitUntil, timeout: config.timeoutMs });
    const [title, html, text, screenshotPath] = await Promise.all([
      page.title(),
      page.content(),
      page.locator("body").innerText().catch(() => ""),
      options.screenshotPath
        ? page.screenshot({ path: options.screenshotPath, fullPage: true }).then(() => options.screenshotPath)
        : Promise.resolve(undefined)
    ]);

    return {
      url: page.url(),
      title,
      html,
      text,
      links: countLinks(html),
      screenshotPath
    };
  }, options);
}

export async function snapshotPage(url: string, options: BrowserRunOptions = {}): Promise<SnapshotResult> {
  const result = await openPage(url, options);
  return {
    url: result.url,
    title: result.title,
    text: result.text,
    links: result.links
  };
}
