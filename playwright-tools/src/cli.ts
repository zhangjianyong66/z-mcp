import { openPage, snapshotPage } from "./browser.js";
import type { BrowserRunOptions } from "./types.js";

function printUsage(): void {
  console.log([
    "Usage:",
    "  playwright-tools open <url> [--headless true|false] [--viewport 1440x900] [--timeout 30000] [--wait-until domcontentloaded|load|networkidle] [--screenshot path] [--html] [--text]",
    "  playwright-tools snapshot <url> [--headless true|false] [--viewport 1440x900] [--timeout 30000] [--wait-until domcontentloaded|load|networkidle]",
    "",
    "Flags:",
    "  --html              Include HTML in JSON output for `open`",
    "  --text              Include text in JSON output for `open`",
    "  --screenshot <path> Save a full-page screenshot",
    "  --headless <bool>   Override headless mode",
    "  --viewport <WxH>    Override viewport size",
    "  --timeout <ms>      Override navigation timeout",
    "  --wait-until <mode> Override page load strategy"
  ].join("\n"));
}

function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`invalid boolean value: ${value}`);
}

function parseViewport(value: string): { width: number; height: number } {
  const match = value.trim().match(/^(\d+)x(\d+)$/i);
  if (!match) {
    throw new Error(`invalid viewport format: ${value}. Expected WIDTHxHEIGHT`);
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

function parseArgs(argv: string[]): {
  command?: "open" | "snapshot";
  url?: string;
  options: BrowserRunOptions;
  includeHtml: boolean;
  includeText: boolean;
} {
  const [command, url, ...rest] = argv;
  if (command !== "open" && command !== "snapshot") {
    return { options: {}, includeHtml: false, includeText: false };
  }

  const options: BrowserRunOptions = {};
  let includeHtml = false;
  let includeText = false;

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token?.startsWith("--")) {
      throw new Error(`unexpected argument: ${token}`);
    }

    if (token === "--html") {
      includeHtml = true;
      continue;
    }
    if (token === "--text") {
      includeText = true;
      continue;
    }
    if (token === "--screenshot") {
      const value = rest[++i];
      if (!value) throw new Error("--screenshot requires a path");
      options.screenshotPath = value;
      continue;
    }

    const value = rest[++i];
    if (!value) {
      throw new Error(`${token} requires a value`);
    }

    switch (token) {
      case "--headless":
        options.headless = parseBoolean(value);
        break;
      case "--viewport":
        options.viewport = parseViewport(value);
        break;
      case "--timeout":
        options.timeoutMs = Number(value);
        break;
      case "--wait-until":
        options.waitUntil = value as BrowserRunOptions["waitUntil"];
        break;
      case "--channel":
        options.channel = value;
        break;
      case "--user-agent":
        options.userAgent = value;
        break;
      default:
        throw new Error(`unknown flag: ${token}`);
    }
  }

  return { command, url, options, includeHtml, includeText };
}

async function main(): Promise<void> {
  const { command, url, options, includeHtml, includeText } = parseArgs(process.argv.slice(2));
  if (!command || !url) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (command === "open") {
    const result = await openPage(url, options);
    const output: Record<string, unknown> = {
      url: result.url,
      title: result.title,
      links: result.links,
      screenshotPath: result.screenshotPath
    };
    if (includeHtml) output.html = result.html;
    if (includeText) output.text = result.text;
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const result = await snapshotPage(url, options);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
