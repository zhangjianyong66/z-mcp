import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPortfolioAndOrders, saveOrders, savePortfolio } from "../src/portfolio-store.js";

async function withTempStore<T>(fn: (path: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "stock-data-mcp-test-"));
  const file = join(dir, "user-data.json");
  process.env.STOCK_DATA_MCP_USER_DATA_FILE = file;
  try {
    return await fn(file);
  } finally {
    delete process.env.STOCK_DATA_MCP_USER_DATA_FILE;
  }
}

test("getPortfolioAndOrders returns friendly message when no data", async () => {
  await withTempStore(async () => {
    const snapshot = await getPortfolioAndOrders(new Date("2026-04-30T10:00:00.000Z"));
    assert.equal(snapshot.portfolio, null);
    assert.equal(snapshot.orders.length, 0);
    assert.equal(snapshot.stats.total, 0);
    assert.ok(snapshot.message?.includes("当前无持仓信息"));
  });
});

test("savePortfolio overwrites and returns warning when market value mismatches", async () => {
  await withTempStore(async () => {
    const result = await savePortfolio({
      totalCapital: 100000,
      availableCapital: 60000,
      positions: [
        {
          symbol: "510300",
          name: "沪深300ETF",
          quantity: 1000,
          costPrice: 4,
          currentPrice: 4.2,
          marketValue: 4100
        }
      ],
      updatedAt: "2026-04-30T09:30:00.000+08:00"
    }, new Date("2026-04-30T10:00:00.000Z"));

    assert.equal(result.warnings.length, 1);
    assert.ok(result.warnings[0]?.includes("510300"));

    const snapshot = await getPortfolioAndOrders(new Date("2026-04-30T10:00:00.000Z"));
    assert.equal(snapshot.portfolio?.totalCapital, 100000);
    assert.equal(snapshot.portfolio?.positions.length, 1);
  });
});

test("saveOrders auto-expires pending orders from previous day", async () => {
  await withTempStore(async () => {
    const save = await saveOrders([
      {
        symbol: "510300",
        name: "沪深300ETF",
        side: "buy",
        quantity: 100,
        orderTime: "2026-04-29T14:00:00+08:00",
        status: "pending"
      },
      {
        symbol: "159915",
        name: "创业板ETF",
        side: "sell",
        quantity: 50,
        orderTime: "2026-04-30T10:00:00+08:00",
        status: "pending"
      }
    ], new Date("2026-04-30T05:00:00.000Z"));

    assert.equal(save.autoExpiredOrderCount, 1);
    assert.equal(save.orders[0]?.status, "expired");
    assert.equal(save.orders[1]?.status, "pending");

    const snapshot = await getPortfolioAndOrders(new Date("2026-04-30T05:00:00.000Z"));
    assert.equal(snapshot.stats.expired, 1);
    assert.equal(snapshot.stats.pending, 1);
  });
});

test("saveOrders is full overwrite", async () => {
  await withTempStore(async () => {
    await saveOrders([
      {
        orderId: "a1",
        symbol: "510300",
        name: "沪深300ETF",
        side: "buy",
        quantity: 100,
        orderTime: "2026-04-30T10:00:00+08:00",
        status: "filled"
      }
    ], new Date("2026-04-30T05:00:00.000Z"));

    await saveOrders([
      {
        orderId: "b1",
        symbol: "159915",
        name: "创业板ETF",
        side: "sell",
        quantity: 80,
        orderTime: "2026-04-30T11:00:00+08:00",
        status: "pending"
      }
    ], new Date("2026-04-30T06:00:00.000Z"));

    const snapshot = await getPortfolioAndOrders(new Date("2026-04-30T06:00:00.000Z"));
    assert.equal(snapshot.orders.length, 1);
    assert.equal(snapshot.orders[0]?.orderId, "b1");
  });
});
