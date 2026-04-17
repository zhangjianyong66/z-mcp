import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type StockDataLogLevel = "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency";

type LogEntry = {
  subsystem: "stock-data-mcp";
  ts: string;
  event: string;
  [key: string]: unknown;
};

const DEFAULT_LOG_FILE = "/tmp/openclaw/stock-data-mcp.log";

let serverRef: McpServer | null = null;
const logFilePath = process.env.STOCK_DATA_MCP_LOG_FILE?.trim() || DEFAULT_LOG_FILE;

export function configureStockDataLogging(server: McpServer): void {
  serverRef = server;
}

function writeToLogFile(line: string): void {
  try {
    mkdirSync(dirname(logFilePath), { recursive: true });
    appendFileSync(logFilePath, `${line}\n`);
  } catch {
    // Best-effort only. We still emit to stderr and MCP logging.
  }
}

function emitToMcp(level: StockDataLogLevel, entry: LogEntry): void {
  if (!serverRef) {
    return;
  }

  void serverRef.server.sendLoggingMessage({
    level,
    logger: "stock-data-mcp",
    data: entry
  }).catch(() => {
    // Logging must never break tool execution.
  });
}

export function logStockDataEvent(
  event: string,
  details: Record<string, unknown>,
  level: StockDataLogLevel = "info"
): void {
  const entry: LogEntry = {
    subsystem: "stock-data-mcp",
    ts: new Date().toISOString(),
    event,
    ...details
  };
  const line = `[stock-data-mcp] ${JSON.stringify(entry)}`;
  process.stderr.write(`${line}\n`);
  writeToLogFile(line);
  emitToMcp(level, entry);
}

export function getStockDataLogFilePath(): string {
  return logFilePath;
}
