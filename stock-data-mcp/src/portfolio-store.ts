import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type {
  PortfolioOrder,
  PortfolioPosition,
  PortfolioSnapshot,
  SaveOrdersResult,
  SavePortfolioResult
} from "./types.js";
import { withDbRetry, withDbTransaction } from "./db.js";

const SHANGHAI_TIMEZONE = "Asia/Shanghai";
const MARKET_VALUE_TOLERANCE = 0.01;

type PortfolioRow = RowDataPacket & {
  id: number;
  total_capital: number;
  available_capital: number;
  updated_at: string | Date;
};

type PositionRow = RowDataPacket & {
  symbol: string;
  name: string;
  quantity: number;
  cost_price: number;
  current_price: number;
  market_value: number;
};

type OrderRow = RowDataPacket & {
  id: number;
  order_id: string | null;
  symbol: string;
  name: string;
  side: "buy" | "sell";
  quantity: number;
  order_time: string | Date;
  status: "pending" | "filled" | "cancelled" | "expired";
};

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

function toIsoTime(value: string | Date): string {
  return new Date(value).toISOString();
}

function toMysqlDatetime(isoTime: string): string {
  return isoTime.slice(0, 19).replace("T", " ");
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

async function loadOrders(): Promise<PortfolioOrder[]> {
  const [rows] = await withDbRetry((pool) =>
    pool.query<OrderRow[]>(
      "SELECT id, order_id, symbol, name, side, quantity, order_time, status FROM etf_orders ORDER BY id ASC"
    )
  );

  return rows.map((row) => ({
    orderId: row.order_id ?? undefined,
    symbol: row.symbol,
    name: row.name,
    side: row.side,
    quantity: Number(row.quantity),
    orderTime: toIsoTime(row.order_time),
    status: row.status
  }));
}

async function overwriteOrders(orders: PortfolioOrder[]): Promise<void> {
  await withDbTransaction(async (conn) => {
    await conn.query("DELETE FROM etf_orders");

    if (orders.length > 0) {
      const values = orders.map((order) => [
        order.orderId ?? null,
        order.symbol,
        order.name,
        order.side,
        order.quantity,
        toMysqlDatetime(order.orderTime),
        order.status
      ]);
      await conn.query(
        "INSERT INTO etf_orders (order_id, symbol, name, side, quantity, order_time, status) VALUES ?",
        [values]
      );
    }

  });
}

export async function savePortfolio(input: {
  totalCapital: number;
  availableCapital: number;
  positions: PortfolioPosition[];
  updatedAt?: string;
}, now: Date = new Date()): Promise<SavePortfolioResult> {
  const updatedAt = input.updatedAt ?? now.toISOString();

  return withDbTransaction(async (conn) => {
    const [ordersRows] = await conn.query<OrderRow[]>(
      "SELECT id, order_id, symbol, name, side, quantity, order_time, status FROM etf_orders ORDER BY id ASC"
    );

    const currentOrders: PortfolioOrder[] = ordersRows.map((row) => ({
      orderId: row.order_id ?? undefined,
      symbol: row.symbol,
      name: row.name,
      side: row.side,
      quantity: Number(row.quantity),
      orderTime: toIsoTime(row.order_time),
      status: row.status
    }));

    const expiredApplied = applyOrderAutoExpire(currentOrders, now);

    if (expiredApplied.expiredCount > 0) {
      await conn.query("DELETE FROM etf_orders");
      if (expiredApplied.orders.length > 0) {
        const values = expiredApplied.orders.map((order) => [
          order.orderId ?? null,
          order.symbol,
          order.name,
          order.side,
          order.quantity,
          toMysqlDatetime(order.orderTime),
          order.status
        ]);
        await conn.query(
          "INSERT INTO etf_orders (order_id, symbol, name, side, quantity, order_time, status) VALUES ?",
          [values]
        );
      }
    }

    await conn.query("DELETE FROM etf_positions");
    await conn.query("DELETE FROM etf_portfolios");

    const [insertPortfolioResult] = await conn.query<ResultSetHeader>(
      "INSERT INTO etf_portfolios (total_capital, available_capital, updated_at) VALUES (?, ?, ?)",
      [input.totalCapital, input.availableCapital, toMysqlDatetime(updatedAt)]
    );

    const portfolioId = insertPortfolioResult.insertId;
    if (input.positions.length > 0) {
      const values = input.positions.map((position) => [
        portfolioId,
        position.symbol,
        position.name,
        position.quantity,
        position.costPrice,
        position.currentPrice,
        position.marketValue
      ]);
      await conn.query(
        "INSERT INTO etf_positions (portfolio_id, symbol, name, quantity, cost_price, current_price, market_value) VALUES ?",
        [values]
      );
    }

    const nextPortfolio = {
      totalCapital: input.totalCapital,
      availableCapital: input.availableCapital,
      positions: input.positions,
      updatedAt
    };

    return {
      portfolio: nextPortfolio,
      warnings: buildPortfolioWarnings(nextPortfolio.positions),
      autoExpiredOrderCount: expiredApplied.expiredCount
    };
  });
}

export async function saveOrders(orders: PortfolioOrder[], now: Date = new Date()): Promise<SaveOrdersResult> {
  const expiredApplied = applyOrderAutoExpire(orders, now);
  await overwriteOrders(expiredApplied.orders);

  return {
    orders: expiredApplied.orders,
    stats: buildOrderStats(expiredApplied.orders),
    autoExpiredOrderCount: expiredApplied.expiredCount
  };
}

export async function getPortfolioAndOrders(now: Date = new Date()): Promise<PortfolioSnapshot> {
  const [portfolioRows] = await withDbRetry((pool) =>
    pool.query<PortfolioRow[]>(
      "SELECT id, total_capital, available_capital, updated_at FROM etf_portfolios ORDER BY id DESC LIMIT 1"
    )
  );
  const orders = await loadOrders();

  const expiredApplied = applyOrderAutoExpire(orders, now);
  if (expiredApplied.expiredCount > 0) {
    await overwriteOrders(expiredApplied.orders);
  }

  if (portfolioRows.length === 0) {
    return {
      portfolio: null,
      orders: expiredApplied.orders,
      stats: buildOrderStats(expiredApplied.orders),
      generatedAt: now.toISOString(),
      autoExpiredOrderCount: expiredApplied.expiredCount,
      message: expiredApplied.orders.length > 0 ? undefined : "当前无持仓信息，请先保存持仓或交易单信息"
    };
  }

  const latestPortfolio = portfolioRows[0];
  const [positionRows] = await withDbRetry((pool) =>
    pool.query<PositionRow[]>(
      "SELECT symbol, name, quantity, cost_price, current_price, market_value FROM etf_positions WHERE portfolio_id = ? ORDER BY id ASC",
      [latestPortfolio.id]
    )
  );

  return {
    portfolio: {
      totalCapital: Number(latestPortfolio.total_capital),
      availableCapital: Number(latestPortfolio.available_capital),
      positions: positionRows.map((row) => ({
        symbol: row.symbol,
        name: row.name,
        quantity: Number(row.quantity),
        costPrice: Number(row.cost_price),
        currentPrice: Number(row.current_price),
        marketValue: Number(row.market_value)
      })),
      updatedAt: toIsoTime(latestPortfolio.updated_at)
    },
    orders: expiredApplied.orders,
    stats: buildOrderStats(expiredApplied.orders),
    generatedAt: now.toISOString(),
    autoExpiredOrderCount: expiredApplied.expiredCount,
    message: undefined
  };
}
