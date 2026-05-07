import mapping from "./data/etf_sector_mapping.json" with { type: "json" };
import type { SectorListResponse } from "./types.js";

export type MappingConfidence = "高" | "中" | "低";

export type EtfSectorMappingItem = {
  symbol: string;
  name: string;
  theme: string;
  primarySector: string;
  alternateSectors: string[];
  confidence: MappingConfidence;
  rationale: string;
};

export type EtfSectorMappingData = {
  generatedAt: string;
  source: string;
  items: EtfSectorMappingItem[];
};

export type SectorMatch = {
  hotScore: number;
  matchedSector: string;
  source: "primary" | "alternate";
};

const mappingData = mapping as EtfSectorMappingData;

const mappingBySymbol = new Map<string, EtfSectorMappingItem>(
  mappingData.items.map((item) => [item.symbol.replace(/^(SH|SZ)/i, ""), item])
);

export function getEtfSectorMapping(): EtfSectorMappingData {
  return mappingData;
}

export function getEtfSectorMappingItem(symbol: string): EtfSectorMappingItem | undefined {
  return mappingBySymbol.get(symbol.replace(/^(SH|SZ)/i, ""));
}

export function resolveSectorHotScore(symbol: string, sectors: SectorListResponse): SectorMatch | null {
  const normalized = symbol.replace(/^(SH|SZ)/i, "");
  const item = mappingBySymbol.get(normalized);
  if (!item) {
    return null;
  }

  const sectorMap = new Map<string, number>(
    sectors.data.map((s) => [s.sectorName, s.hotScore])
  );

  const primaryScore = sectorMap.get(item.primarySector);
  if (typeof primaryScore === "number") {
    return { hotScore: primaryScore, matchedSector: item.primarySector, source: "primary" };
  }

  for (const alt of item.alternateSectors) {
    const score = sectorMap.get(alt);
    if (typeof score === "number") {
      return { hotScore: score, matchedSector: alt, source: "alternate" };
    }
  }

  return null;
}
