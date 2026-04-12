export type EtfProvider = "eastmoney" | "xueqiu";

export type EtfInput = {
  symbol: string;
  source?: EtfProvider;
  timeout?: number;
};

export type EtfKlineInput = EtfInput & {
  days?: number;
};

export type EtfListInput = {
  limit?: number;
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

export type NormalizedEtfListInput = {
  limit: number;
  timeoutMs: number;
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
  price: number | null;
  changePercent: number | null;
  changeAmount: number | null;
  volume: number | null;
  amount: number | null;
};

export type EtfListResponse = {
  source: "eastmoney";
  generatedAt: string;
  limit: number;
  count: number;
  data: EtfListItem[];
};

export type EtfProviderApi = {
  quote(input: NormalizedEtfInput): Promise<EtfQuote>;
  kline(input: NormalizedEtfKlineInput): Promise<EtfKlinePoint[]>;
  list?(input: NormalizedEtfListInput): Promise<EtfListItem[]>;
};

export type EtfProviderMap = Record<EtfProvider, EtfProviderApi>;
