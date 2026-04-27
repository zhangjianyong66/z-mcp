export type EtfProvider = "xueqiu";
export type SectorListSource = "akshare_ths";

export type EtfInput = {
  symbol: string;
  source?: EtfProvider;
  timeout?: number;
};

export type EtfKlineInput = EtfInput & {
  days?: number;
};

export type SectorListSortBy = "gainers" | "losers" | "hot";

export type SectorListInput = {
  limit?: number;
  page?: number;
  pageSize?: number;
  sortBy?: SectorListSortBy;
  timeout?: number;
};

export type NormalizedEtfInput = {
  symbol: string;
  provider: EtfProvider;
  timeoutMs: number;
  normalizedSymbol: NormalizedSymbol;
};

export type NormalizedEtfKlineInput = NormalizedEtfInput & {
  days: number;
};

export type NormalizedSectorListInput = {
  page: number;
  limit: number;
  pageSize: number;
  sortBy: SectorListSortBy;
  timeoutMs: number;
};

export type StockDataLogContext = {
  requestId?: string;
};

export type NormalizedSymbol = {
  code: string;
  market: "SH" | "SZ";
  prefixed: string;
  secid: string;
};

export type EtfQuote = {
  symbol: string;
  name?: string;
  price: number | null;
  changePercent: number | null;
  changeAmount: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  volume: number | null;
  amount: number | null;
  turnoverRate?: number | null;
};

export type EtfKlinePoint = {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number | null;
  changePercent: number | null;
};

export type EtfQuoteResponse = {
  source: EtfProvider;
  symbol: string;
  normalizedSymbol: string;
  generatedAt: string;
  data: EtfQuote;
};

export type EtfKlineResponse = {
  source: EtfProvider;
  symbol: string;
  normalizedSymbol: string;
  generatedAt: string;
  days: number;
  count: number;
  data: EtfKlinePoint[];
};

export type EtfAnalyzeResponse = {
  source: EtfProvider;
  symbol: string;
  normalizedSymbol: string;
  generatedAt: string;
  quote: EtfQuote;
  indicators: {
    current: number;
    ma5: number | null;
    ma10: number | null;
    ma20: number | null;
    high30: number;
    low30: number;
    trend: string;
  };
  recentKlines: EtfKlinePoint[];
};

export type EtfProviderApi = {
  quote(input: NormalizedEtfInput, context?: StockDataLogContext): Promise<EtfQuote>;
  kline(input: NormalizedEtfKlineInput, context?: StockDataLogContext): Promise<EtfKlinePoint[]>;
};

export type EtfProviderMap = Record<EtfProvider, EtfProviderApi>;

export type SectorListItem = {
  sectorName: string;
  changePercent: number | null;
  upCount: number | null;
  downCount: number | null;
  amount: number | null;
  netInflow: number | null;
  leaderStock: string | null;
  leaderLatestPrice: number | null;
  leaderChangePercent: number | null;
  marketScore: number;
  newsScore: number;
  hotScore: number;
};

export type SectorListResponse = {
  source: SectorListSource;
  generatedAt: string;
  sortBy: SectorListSortBy;
  page: number;
  pageSize: number;
  limit: number;
  total: number;
  count: number;
  hasMore: boolean;
  newsScoreDegraded: boolean;
  data: SectorListItem[];
};

export type SectorSnapshotItem = Omit<SectorListItem, "marketScore" | "newsScore" | "hotScore">;

export type SectorProviderApi = {
  listIndustrySummary(input: NormalizedSectorListInput, context?: StockDataLogContext): Promise<SectorSnapshotItem[]>;
};
