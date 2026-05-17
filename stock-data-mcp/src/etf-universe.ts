import type { RowDataPacket } from "mysql2";
import { withDbRetry } from "./db.js";

export type EtfUniverseItem = {
  symbol: string;
  name: string;
  theme: string;
};

type UniverseRow = RowDataPacket & {
  symbol: string;
  name: string;
  theme: string;
};

function normalizeSymbol(symbol: string): string {
  return symbol.replace(/^(SH|SZ)/i, "");
}

export async function getEtfUniverse(): Promise<EtfUniverseItem[]> {
  const [rows] = await withDbRetry((pool) =>
    pool.query<UniverseRow[]>(
      "SELECT symbol, name, theme FROM etf_universe ORDER BY symbol ASC"
    )
  );

  return rows.map((item) => ({
    symbol: normalizeSymbol(item.symbol),
    name: item.name,
    theme: item.theme
  }));
}

export async function getEtfUniverseItem(symbol: string): Promise<EtfUniverseItem | undefined> {
  const normalized = normalizeSymbol(symbol);
  const [rows] = await withDbRetry((pool) =>
    pool.query<UniverseRow[]>(
      "SELECT symbol, name, theme FROM etf_universe WHERE REPLACE(REPLACE(UPPER(symbol), 'SH', ''), 'SZ', '') = ? LIMIT 1",
      [normalized]
    )
  );

  if (rows.length === 0) {
    return undefined;
  }

  const item = rows[0];
  return {
    symbol: normalizeSymbol(item.symbol),
    name: item.name,
    theme: item.theme
  };
}
