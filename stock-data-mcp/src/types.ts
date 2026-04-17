export type EtfProvider = "eastmoney" | "xueqiu";
export type EtfListSource = "auto" | "eastmoney" | "sse";

export type EtfInput = {
  symbol: string;
  source?: EtfProvider;
  timeout?: number;
};

export type EtfKlineInput = EtfInput & {
  days?: number;
};

export type EtfListSortBy = "gainers" | "losers" | "volume" | "amount" | "turnoverRate";

export type EtfListInput = {
  limit?: number;
  page?: number;
  pageSize?: number;
  sortBy?: EtfListSortBy;
  fetchAll?: boolean;
  timeout?: number;
  source?: EtfListSource;
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

export type NormalizedEtfListInput = {
  page: number;
  limit: number;
  pageSize: number;
  sortBy: EtfListSortBy;
  fetchAll: boolean;
  source: EtfListSource;
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

export type EtfListItem = {
  symbol: string;
  name: string;
  market: "SH" | "SZ";
  normalizedSymbol: string;
  secid: string;
  fundAbbr?: string;
  fundExpansionAbbr?: string;
  companyName?: string;
  companyCode?: string;
  indexName?: string;
  listingDate?: string;
  category?: string;
  scale?: number | null;
  price: number | null;
  changePercent: number | null;
  changeAmount: number | null;
  volume: number | null;
  amount: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  amplitude: number | null;
  turnoverRate: number | null;
  volumeRatio: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  totalMarketValue: number | null;
  circulationMarketValue: number | null;
  change60d: number | null;
  changeYtd: number | null;
};

export type EtfListResponse = {
  source: EtfListSource;
  sourceUrl: string;
  sourceQuery: {
    page: number;
    pageSize: number;
    sortBy: EtfListSortBy;
  };
  generatedAt: string;
  sortBy: EtfListSortBy;
  fetchAll: boolean;
  page: number;
  pageSize: number;
  limit: number;
  total: number;
  count: number;
  hasMore: boolean;
  data: EtfListItem[];
};

export type EtfProviderApi = {
  quote(input: NormalizedEtfInput, context?: StockDataLogContext): Promise<EtfQuote>;
  kline(input: NormalizedEtfKlineInput, context?: StockDataLogContext): Promise<EtfKlinePoint[]>;
  list?(input: NormalizedEtfListInput, context?: StockDataLogContext): Promise<EtfListPage>;
};

export type EtfProviderMap = Record<EtfProvider, EtfProviderApi>;

export type EtfListPage = {
  total: number | null;
  items: EtfListItem[];
};
