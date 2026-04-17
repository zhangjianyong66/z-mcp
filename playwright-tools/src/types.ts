import type { Browser, BrowserContext, BrowserContextOptions, LaunchOptions, Page } from "playwright";

export interface ViewportSize {
  width: number;
  height: number;
}

export interface PlaywrightRuntimeConfig {
  headless: boolean;
  channel?: string;
  executablePath?: string;
  userAgent?: string;
  viewport: ViewportSize;
  timeoutMs: number;
  waitUntil: "load" | "domcontentloaded" | "networkidle";
}

export interface BrowserRunOptions extends Partial<PlaywrightRuntimeConfig> {
  screenshotPath?: string;
}

export interface OpenPageResult {
  url: string;
  title: string;
  html: string;
  text: string;
  links: number;
  screenshotPath?: string;
}

export interface SnapshotResult {
  url: string;
  title: string;
  text: string;
  links: number;
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export type { BrowserContextOptions, LaunchOptions };
