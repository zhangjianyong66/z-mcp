import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  PortfolioData,
  PortfolioOrder,
  PortfolioPosition,
  PortfolioSnapshot,
  SaveOrdersResult,
  SavePortfolioResult
} from "./types.js";

const DEFAULT_DATA_FILE = join(homedir(), ".stock-data-mcp", "user-data.json");
const SHANGHAI_TIMEZONE = "Asia/Shanghai";
const MARKET_VALUE_TOLERANCE = 0.01;

function resolveDataFilePath(): string {
  const fromEnv = process.env.STOCK_DATA_MCP_USER_DATA_FILE?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  return DEFAULT_DATA_FILE;
}

function toShanghaiDayKey(isoTime: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(new Date(isoTime));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`failed to format date in ${SHANGHAI_TIMEZONE}`);
  }
  return `${year}-${month}-${day}`;
}

function applyOrderAutoExpire(orders: PortfolioOrder[], now: Date): { orders: PortfolioOrder[]; expiredCount: number } {
  const todayKey = toShanghaiDayKey(now.toISOString());
  let expiredCount = 0;

  const nextOrders = orders.map((order) => {
    if (order.status !== "pending") {
      return order;
    }

    const orderDay = toShanghaiDayKey(order.orderTime);
    if (orderDay < todayKey) {
      expiredCount += 1;
      return {
        ...order,
        status: "expired" as const
      };
    }

    return order;
  });

  return { orders: nextOrders, expiredCount };
}

function buildOrderStats(orders: PortfolioOrder[]): PortfolioSnapshot["stats"] {
  const stats = {
    total: orders.length,
    pending: 0,
    filled: 0,
    cancelled: 0,
    expired: 0
  };

  for (const order of orders) {
    if (order.status === "pending") {
      stats.pending += 1;
    } else if (order.status === "filled") {
      stats.filled += 1;
    } else if (order.status === "cancelled") {
      stats.cancelled += 1;
    } else if (order.status === "expired") {
      stats.expired += 1;
    }
  }

  return stats;
}

async function readStore(path: string): Promise<PortfolioData | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as PortfolioData;
    return {
      portfolio: parsed.portfolio ?? null,
      orders: Array.isArray(parsed.orders) ? parsed.orders : []
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeStore(path: string, data: PortfolioData): Promise<void> {
  const folder = dirname(path);
  await mkdir(folder, { recursive: true });
  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tmpPath, path);
}

function buildPortfolioWarnings(positions: PortfolioPosition[]): string[] {
  const warnings: string[] = [];
  for (const position of positions) {
    const calc = Number((position.quantity * position.currentPrice).toFixed(3));
    const diff = Math.abs(calc - position.marketValue);
    if (diff > MARKET_VALUE_TOLERANCE) {
      warnings.push(
        `${position.symbol}(${position.name}) marketValue=${position.marketValue} 与 quantity*currentPrice=${calc} 不一致`
      );
    }
  }
  return warnings;
}

export async function savePortfolio(input: {
  totalCapital: number;
  availableCapital: number;
  positions: PortfolioPosition[];
  updatedAt?: string;
}, now: Date = new Date()): Promise<SavePortfolioResult> {
  const path = resolveDataFilePath();
  const store = (await readStore(path)) ?? { portfolio: null, orders: [] };
  const updatedAt = input.updatedAt ?? now.toISOString();
  const nextPortfolio = {
    totalCapital: input.totalCapital,
    availableCapital: input.availableCapital,
    positions: input.positions,
    updatedAt
  };

  const expiredApplied = applyOrderAutoExpire(store.orders, now);
  await writeStore(path, {
    portfolio: nextPortfolio,
    orders: expiredApplied.orders
  });

  return {
    portfolio: nextPortfolio,
    warnings: buildPortfolioWarnings(nextPortfolio.positions),
    autoExpiredOrderCount: expiredApplied.expiredCount
  };
}

export async function saveOrders(orders: PortfolioOrder[], now: Date = new Date()): Promise<SaveOrdersResult> {
  const path = resolveDataFilePath();
  const store = (await readStore(path)) ?? { portfolio: null, orders: [] };
  const expiredApplied = applyOrderAutoExpire(orders, now);

  await writeStore(path, {
    portfolio: store.portfolio,
    orders: expiredApplied.orders
  });

  return {
    orders: expiredApplied.orders,
    stats: buildOrderStats(expiredApplied.orders),
    autoExpiredOrderCount: expiredApplied.expiredCount
  };
}

export async function getPortfolioAndOrders(now: Date = new Date()): Promise<PortfolioSnapshot> {
  const path = resolveDataFilePath();
  const store = await readStore(path);

  if (!store) {
    return {
      portfolio: null,
      orders: [],
      stats: {
        total: 0,
        pending: 0,
        filled: 0,
        cancelled: 0,
        expired: 0
      },
      generatedAt: now.toISOString(),
      message: "当前无持仓信息，请先保存持仓或交易单信息"
    };
  }

  const expiredApplied = applyOrderAutoExpire(store.orders, now);
  if (expiredApplied.expiredCount > 0) {
    await writeStore(path, {
      portfolio: store.portfolio,
      orders: expiredApplied.orders
    });
  }

  return {
    portfolio: store.portfolio,
    orders: expiredApplied.orders,
    stats: buildOrderStats(expiredApplied.orders),
    generatedAt: now.toISOString(),
    autoExpiredOrderCount: expiredApplied.expiredCount,
    message: store.portfolio || expiredApplied.orders.length > 0
      ? undefined
      : "当前无持仓信息，请先保存持仓或交易单信息"
  };
}
