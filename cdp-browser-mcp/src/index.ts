import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { z } from "zod";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

type ToolResponse = {
  success: boolean;
  code: string;
  message: string;
  data: JsonValue;
  meta?: Record<string, JsonValue>;
};

type TabInfo = {
  tab_id: string;
  context_index: number;
  page_index: number;
  url: string;
  title: string;
};

const CDP_ENDPOINT = process.env.CDP_ENDPOINT ?? "http://127.0.0.1:9222";
const DEFAULT_TIMEOUT_MS = Number(process.env.CDP_ACTION_TIMEOUT_MS ?? 10000);
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const START_CHROME_SCRIPT = resolve(PROJECT_ROOT, "scripts/start-chrome-cdp.sh");

const server = new McpServer({
  name: "cdp-browser-mcp",
  version: "0.1.0"
});

function ok(message: string, data: JsonValue, meta?: Record<string, JsonValue>): ToolResponse {
  return {
    success: true,
    code: "ok",
    message,
    data,
    ...(meta ? { meta } : {})
  };
}

function fail(code: string, message: string, meta?: Record<string, JsonValue>): ToolResponse {
  return {
    success: false,
    code,
    message,
    data: null,
    ...(meta ? { meta } : {})
  };
}

function toPayload(response: ToolResponse): { content: Array<{ type: "text"; text: string }>; isError?: true } {
  const payload: { content: Array<{ type: "text"; text: string }>; isError?: true } = {
    content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
  };
  if (!response.success) {
    payload.isError = true;
  }
  return payload;
}

function getJson(pathname: string): Promise<JsonValue> {
  const url = new URL(pathname, CDP_ENDPOINT);
  return new Promise((resolvePromise, rejectPromise) => {
    const req = http.get(url, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        if ((res.statusCode ?? 500) < 200 || (res.statusCode ?? 500) >= 300) {
          rejectPromise(new Error(`HTTP ${res.statusCode} from ${url.toString()}`));
          return;
        }
        try {
          resolvePromise(JSON.parse(raw) as JsonValue);
        } catch (error) {
          rejectPromise(new Error(`Invalid JSON from ${url.toString()}: ${error instanceof Error ? error.message : String(error)}`));
        }
      });
    });
    req.on("error", rejectPromise);
    req.setTimeout(3000, () => {
      req.destroy(new Error(`Timeout fetching ${url.toString()}`));
    });
  });
}

async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function collectTabs(browser: Browser): Promise<Array<{ info: TabInfo; page: Page }>> {
  const entries: Array<{ info: TabInfo; page: Page }> = [];
  const contexts = browser.contexts();
  for (let c = 0; c < contexts.length; c += 1) {
    const pages = contexts[c].pages();
    for (let p = 0; p < pages.length; p += 1) {
      const page = pages[p];
      let title = "";
      try {
        title = (await page.title()) || "";
      } catch {
        title = "";
      }
      entries.push({
        info: {
          tab_id: `${c}:${p}`,
          context_index: c,
          page_index: p,
          url: page.url(),
          title
        },
        page
      });
    }
  }
  return entries;
}

function parseTabId(tabId: string): { contextIndex: number; pageIndex: number } | null {
  const match = /^(\d+):(\d+)$/.exec(tabId);
  if (!match) return null;
  return { contextIndex: Number(match[1]), pageIndex: Number(match[2]) };
}

async function resolvePage(
  browser: Browser,
  tabId: string | undefined,
  createIfMissing: boolean
): Promise<{ page: Page; tabInfo: TabInfo }> {
  const contexts = browser.contexts();

  if (tabId) {
    const parsed = parseTabId(tabId);
    if (!parsed) {
      throw new Error(`Invalid tab_id '${tabId}'. Expected format 'contextIndex:pageIndex', e.g. '0:1'.`);
    }
    const ctx = contexts[parsed.contextIndex];
    const page = ctx?.pages()[parsed.pageIndex];
    if (!ctx || !page) {
      throw new Error(`tab_id '${tabId}' not found.`);
    }
    return {
      page,
      tabInfo: {
        tab_id: tabId,
        context_index: parsed.contextIndex,
        page_index: parsed.pageIndex,
        url: page.url(),
        title: (await page.title().catch(() => "")) || ""
      }
    };
  }

  const tabs = await collectTabs(browser);
  if (tabs.length > 0) {
    return { page: tabs[0].page, tabInfo: tabs[0].info };
  }

  if (!createIfMissing) {
    throw new Error("No tab available.");
  }

  let context: BrowserContext | undefined = contexts[0];
  if (!context) {
    context = await browser.newContext();
  }
  const page = await context.newPage();
  return {
    page,
    tabInfo: {
      tab_id: "0:0",
      context_index: 0,
      page_index: 0,
      url: page.url(),
      title: ""
    }
  };
}

async function runTool(
  toolName: string,
  fn: () => Promise<JsonValue>
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: true }> {
  const requestId = randomUUID();
  const started = Date.now();
  try {
    const data = await fn();
    return toPayload(
      ok("ok", data, {
        request_id: requestId,
        tool: toolName,
        duration_ms: Date.now() - started
      })
    );
  } catch (error) {
    return toPayload(
      fail("internal_error", error instanceof Error ? error.message : String(error), {
        request_id: requestId,
        tool: toolName,
        duration_ms: Date.now() - started
      })
    );
  }
}

server.tool("cdp_health", "Check CDP endpoint and browser metadata.", {}, async () =>
  runTool("cdp_health", async () => {
    const version = (await getJson("/json/version")) as Record<string, JsonValue>;
    const targets = await getJson("/json/list");
    const targetCount = Array.isArray(targets) ? targets.length : 0;
    return {
      endpoint: CDP_ENDPOINT,
      browser: version.Browser ?? "",
      protocol_version: version["Protocol-Version"] ?? "",
      user_agent: version["User-Agent"] ?? "",
      web_socket_debugger_url: version.webSocketDebuggerUrl ?? "",
      targets: targetCount
    };
  })
);

server.tool(
  "start_chrome_cdp",
  "Start system Chrome with CDP enabled (default port 9222) using the bundled startup script.",
  {
    cdp_port: z.number().int().positive().max(65535).optional(),
    user_data_dir: z.string().min(1).optional(),
    profile_directory: z.string().min(1).optional(),
    chrome_bin: z.string().min(1).optional(),
    log_file: z.string().min(1).optional()
  },
  async ({ cdp_port, user_data_dir, profile_directory, chrome_bin, log_file }) =>
    runTool("start_chrome_cdp", async () => {
      const env = {
        ...process.env,
        ...(cdp_port ? { CDP_PORT: String(cdp_port) } : {}),
        ...(user_data_dir ? { USER_DATA_DIR: user_data_dir } : {}),
        ...(profile_directory ? { PROFILE_DIRECTORY: profile_directory } : {}),
        ...(chrome_bin ? { CHROME_BIN: chrome_bin } : {}),
        ...(log_file ? { LOG_FILE: log_file } : {})
      };

      const result = await new Promise<{ stdout: string; stderr: string }>((resolvePromise, rejectPromise) => {
        execFile("/bin/zsh", [START_CHROME_SCRIPT], { env, timeout: 45000 }, (error, stdout, stderr) => {
          if (error) {
            rejectPromise(
              new Error(
                `Failed to start Chrome CDP via script ${START_CHROME_SCRIPT}: ${error.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`
              )
            );
            return;
          }
          resolvePromise({ stdout, stderr });
        });
      });

      return {
        endpoint: `http://127.0.0.1:${cdp_port ?? 9222}`,
        script: START_CHROME_SCRIPT,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim()
      };
    })
);

server.tool("list_tabs", "List available tabs in the connected Chrome browser.", {}, async () =>
  runTool("list_tabs", async () =>
    withBrowser(async (browser) => {
      const tabs = await collectTabs(browser);
      return {
        count: tabs.length,
        tabs: tabs.map((t) => t.info)
      };
    })
  )
);

server.tool(
  "new_tab",
  "Create a new tab and optionally navigate to a URL.",
  {
    url: z.string().url().optional()
  },
  async ({ url }) =>
    runTool("new_tab", async () =>
      withBrowser(async (browser) => {
        let context = browser.contexts()[0];
        if (!context) {
          context = await browser.newContext();
        }
        const page = await context.newPage();
        if (url) {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT_MS });
        }
        const tabs = await collectTabs(browser);
        const found = tabs.find((t) => t.page === page);
        return {
          tab_id: found?.info.tab_id ?? "",
          url: page.url(),
          title: (await page.title().catch(() => "")) || ""
        };
      })
    )
);

server.tool(
  "navigate",
  "Navigate a tab to a URL.",
  {
    url: z.string().url(),
    tab_id: z.string().optional(),
    wait_until: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional()
  },
  async ({ url, tab_id, wait_until }) =>
    runTool("navigate", async () =>
      withBrowser(async (browser) => {
        const { page, tabInfo } = await resolvePage(browser, tab_id, true);
        await page.goto(url, {
          waitUntil: wait_until ?? "domcontentloaded",
          timeout: DEFAULT_TIMEOUT_MS
        });
        return {
          tab_id: tabInfo.tab_id,
          url: page.url(),
          title: (await page.title().catch(() => "")) || ""
        };
      })
    )
);

server.tool(
  "click",
  "Click an element on a tab by CSS/text selector.",
  {
    selector: z.string().min(1),
    tab_id: z.string().optional(),
    timeout_ms: z.number().int().positive().max(120000).optional()
  },
  async ({ selector, tab_id, timeout_ms }) =>
    runTool("click", async () =>
      withBrowser(async (browser) => {
        const { page, tabInfo } = await resolvePage(browser, tab_id, false);
        await page.click(selector, { timeout: timeout_ms ?? DEFAULT_TIMEOUT_MS });
        return {
          tab_id: tabInfo.tab_id,
          selector,
          url: page.url()
        };
      })
    )
);

server.tool(
  "type_text",
  "Type text into an element. Optionally clear existing value and press Enter.",
  {
    selector: z.string().min(1),
    text: z.string(),
    tab_id: z.string().optional(),
    clear_first: z.boolean().optional(),
    press_enter: z.boolean().optional(),
    timeout_ms: z.number().int().positive().max(120000).optional()
  },
  async ({ selector, text, tab_id, clear_first, press_enter, timeout_ms }) =>
    runTool("type_text", async () =>
      withBrowser(async (browser) => {
        const { page, tabInfo } = await resolvePage(browser, tab_id, false);
        await page.waitForSelector(selector, { timeout: timeout_ms ?? DEFAULT_TIMEOUT_MS });
        if (clear_first) {
          await page.fill(selector, "");
        }
        await page.fill(selector, text, { timeout: timeout_ms ?? DEFAULT_TIMEOUT_MS });
        if (press_enter) {
          await page.press(selector, "Enter", { timeout: timeout_ms ?? DEFAULT_TIMEOUT_MS });
        }
        return {
          tab_id: tabInfo.tab_id,
          selector,
          typed_length: text.length,
          pressed_enter: Boolean(press_enter)
        };
      })
    )
);

server.tool(
  "evaluate_js",
  "Run JavaScript in the tab page context and return a JSON-serializable value.",
  {
    script: z.string().min(1),
    tab_id: z.string().optional()
  },
  async ({ script, tab_id }) =>
    runTool("evaluate_js", async () =>
      withBrowser(async (browser) => {
        const { page, tabInfo } = await resolvePage(browser, tab_id, false);
        const value = await page.evaluate(
          ({ body }) => {
            // Intentionally using Function for a generic MCP evaluator.
            // eslint-disable-next-line no-new-func
            const fn = new Function(body);
            return fn();
          },
          { body: script }
        );
        return {
          tab_id: tabInfo.tab_id,
          value: (value ?? null) as JsonValue
        };
      })
    )
);

server.tool(
  "screenshot",
  "Take screenshot of a tab and save it to a file path.",
  {
    tab_id: z.string().optional(),
    full_page: z.boolean().optional(),
    path: z.string().optional()
  },
  async ({ tab_id, full_page, path }) =>
    runTool("screenshot", async () =>
      withBrowser(async (browser) => {
        const { page, tabInfo } = await resolvePage(browser, tab_id, false);
        const filePath =
          path && path.trim().length > 0 ? path : `/tmp/cdp-browser-mcp-${Date.now()}-${randomUUID()}.png`;
        await page.screenshot({ path: filePath, fullPage: Boolean(full_page) });
        return {
          tab_id: tabInfo.tab_id,
          path: filePath,
          url: page.url()
        };
      })
    )
);

server.tool(
  "close_tab",
  "Close a tab by tab_id.",
  {
    tab_id: z.string().min(1)
  },
  async ({ tab_id }) =>
    runTool("close_tab", async () =>
      withBrowser(async (browser) => {
        const { page } = await resolvePage(browser, tab_id, false);
        const closedUrl = page.url();
        await page.close();
        return {
          tab_id,
          closed_url: closedUrl
        };
      })
    )
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
