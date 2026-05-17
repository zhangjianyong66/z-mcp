import { withDbTransaction } from "./db.js";
import type { SectorListResponse } from "./types.js";

export type SaveSectorHotLatestResult = {
  total: number;
};

const CREATE_SECTOR_HOT_LATEST_SQL = `
CREATE TABLE IF NOT EXISTS sector_hot_latest (
  sector_name VARCHAR(128) NOT NULL PRIMARY KEY,
  change_percent DOUBLE NULL,
  up_count INT NULL,
  down_count INT NULL,
  amount DOUBLE NULL,
  net_inflow DOUBLE NULL,
  leader_stock VARCHAR(128) NULL,
  leader_latest_price DOUBLE NULL,
  leader_change_percent DOUBLE NULL,
  market_score DOUBLE NOT NULL,
  news_score DOUBLE NOT NULL,
  hot_score DOUBLE NOT NULL,
  source VARCHAR(32) NOT NULL,
  generated_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
)
`;

function toMysqlDatetime(isoTime: string): string {
  return isoTime.slice(0, 19).replace("T", " ");
}

export async function saveHotSectorsSnapshot(input: SectorListResponse): Promise<SaveSectorHotLatestResult> {
  const now = new Date().toISOString();

  return withDbTransaction(async (conn) => {
    await conn.query(CREATE_SECTOR_HOT_LATEST_SQL);
    await conn.query("DELETE FROM sector_hot_latest");

    if (input.data.length > 0) {
      const deduped = new Map<string, SectorListResponse["data"][number]>();
      for (const item of input.data) {
        const prev = deduped.get(item.sectorName);
        if (!prev || item.hotScore > prev.hotScore) {
          deduped.set(item.sectorName, item);
        }
      }

      const values = Array.from(deduped.values()).map((item) => [
        item.sectorName,
        item.changePercent,
        item.upCount,
        item.downCount,
        item.amount,
        item.netInflow,
        item.leaderStock,
        item.leaderLatestPrice,
        item.leaderChangePercent,
        item.marketScore,
        item.newsScore,
        item.hotScore,
        input.source,
        toMysqlDatetime(input.generatedAt),
        toMysqlDatetime(now)
      ]);
      await conn.query(
        "INSERT INTO sector_hot_latest (sector_name, change_percent, up_count, down_count, amount, net_inflow, leader_stock, leader_latest_price, leader_change_percent, market_score, news_score, hot_score, source, generated_at, updated_at) VALUES ?",
        [values]
      );
    }

    return { total: input.data.length };
  });
}
