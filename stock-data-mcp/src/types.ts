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

export type EtfBatchInput = {
  symbols: string[];
  source?: EtfProvider;
  timeout?: number;
};

export type EtfBatchKlineInput = EtfBatchInput & {
  days?: number;
};

export type SectorListSortBy = "gainers" | "losers" | "hot";

export type SectorListInput = {
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

export type NormalizedEtfBatchInput = {
  symbols: NormalizedEtfInput[];
  provider: EtfProvider;
};

export type NormalizedEtfBatchKlineInput = {
  symbols: NormalizedEtfKlineInput[];
  provider: EtfProvider;
};

export type NormalizedSectorListInput = {
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

export type EtfBatchErrorItem = {
  symbol: string;
  error: string;
  code?: EtfBatchErrorCode;
  retryable?: boolean;
};

export type EtfBatchErrorCode = "invalid_input" | "timeout" | "upstream_error" | "internal_error";
export type Trend = "bullish" | "bearish" | "rangebound" | "insufficient_data";

export type EtfBatchQuoteItem = {
  symbol: string;
  normalizedSymbol: string;
  data: EtfQuote;
};

export type EtfBatchQuoteResponse = {
  source: EtfProvider;
  generatedAt: string;
  total: number;
  successCount: number;
  errorCount: number;
  results: EtfBatchQuoteItem[];
  errors: EtfBatchErrorItem[];
};

export type EtfBatchKlineItem = {
  symbol: string;
  normalizedSymbol: string;
  days: number;
  count: number;
  data: EtfKlinePoint[];
};

export type EtfBatchKlineResponse = {
  source: EtfProvider;
  generatedAt: string;
  total: number;
  successCount: number;
  errorCount: number;
  results: EtfBatchKlineItem[];
  errors: EtfBatchErrorItem[];
};

export type EtfBatchAnalyzeItem = {
  symbol: string;
  normalizedSymbol: string;
  quote: EtfQuote;
  indicators: {
    current: number;
    ma5: number | null;
    ma10: number | null;
    ma20: number | null;
    high30: number;
    low30: number;
    trend: Trend;
  };
  recentKlines: EtfKlinePoint[];
};

export type EtfBatchAnalyzeResponse = {
  source: EtfProvider;
  generatedAt: string;
  total: number;
  successCount: number;
  errorCount: number;
  results: EtfBatchAnalyzeItem[];
  errors: EtfBatchErrorItem[];
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
    trend: Trend;
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
  total: number;
  newsScoreDegraded: boolean;
  data: SectorListItem[];
};

export type SectorSnapshotItem = Omit<SectorListItem, "marketScore" | "newsScore" | "hotScore">;

export type SectorProviderApi = {
  listIndustrySummary(input: NormalizedSectorListInput, context?: StockDataLogContext): Promise<SectorSnapshotItem[]>;
};

export type PortfolioPosition = {
  symbol: string;
  name: string;
  quantity: number;
  costPrice: number;
  currentPrice: number;
  marketValue: number;
};

export type PortfolioInfo = {
  totalCapital: number;
  availableCapital: number;
  positions: PortfolioPosition[];
  updatedAt: string;
};

export type PortfolioOrderStatus = "pending" | "filled" | "cancelled" | "expired";
export type PortfolioOrderSide = "buy" | "sell";

export type PortfolioOrder = {
  orderId?: string;
  symbol: string;
  name: string;
  side: PortfolioOrderSide;
  quantity: number;
  orderTime: string;
  status: PortfolioOrderStatus;
};

export type PortfolioData = {
  portfolio: PortfolioInfo | null;
  orders: PortfolioOrder[];
};

export type PortfolioOrderStats = {
  total: number;
  pending: number;
  filled: number;
  cancelled: number;
  expired: number;
};

export type PortfolioSnapshot = {
  portfolio: PortfolioInfo | null;
  orders: PortfolioOrder[];
  stats: PortfolioOrderStats;
  generatedAt: string;
  autoExpiredOrderCount?: number;
  message?: string;
};

export type SavePortfolioResult = {
  portfolio: PortfolioInfo;
  warnings: string[];
  autoExpiredOrderCount: number;
};

export type SaveOrdersResult = {
  orders: PortfolioOrder[];
  stats: PortfolioOrderStats;
  autoExpiredOrderCount: number;
};

export type EtfBatchDecideInput = EtfBatchKlineInput & {
  riskPct?: number;
  singleEtfExposureCapPct?: number;
  /**
   * Deprecated and ignored. etf_batch_decide always uses v2 scoring.
   */
  scoreCalibrationVersion?: "v1" | "v2";
};

export type EtfBatchDecideErrorCode =
  | "TIMEOUT"
  | "TIMEOUT_BUDGET_EXHAUSTED"
  | "UPSTREAM_AUTH"
  | "UPSTREAM_TEMPORARY"
  | "INVALID_INPUT"
  | "INTERNAL_ERROR"
  | "MISSING_ACCOUNT_SNAPSHOT"
  | "PARTIAL_BATCH_FAIL"
  | "MISSING_REQUIRED_FIELD"
  | "DOWNGRADED_NEWS_SCORE"
  | "UNIT_MISMATCH"
  | "UNKNOWN";

export type EtfBatchDecideAction = "open_buy" | "increase_buy" | "replace_buy" | "hold_watch" | "no_trade";
export type EtfBatchDecideActionReason =
  | "trend_not_tradeable"
  | "structure_not_matched"
  | "insufficient_safety_margin"
  | "risk_not_definable"
  | "insufficient_exposure_room"
  | "single_exposure_limit"
  | "capital_limit"
  | "risk_limit"
  | "unit_mismatch"
  | "score_below_buy_threshold"
  | "target_qty_below_lot"
  | "pending_order_already_sufficient"
  | "buy_signal_confirmed"
  | "unknown_reason";

export type EtfBatchDecideStructureReason =
  | "passed"
  | "trend_not_tradeable"
  | "price_above_ma5_and_far_from_ma10"
  | "unknown";

export type EtfBatchDecideResultItem = {
  symbol: string;
  normalizedSymbol: string;
  name: string;
  unitCheck: {
    status: "pass" | "fail";
    reason: string | null;
  };
  exposureMetrics: {
    positionMarketValue: number;
    pendingBuyQty: number;
    currentPriceUsed: number;
    symbolExposure: number;
    symbolCap: number;
    symbolRatio: number;
    symbolExposureRoom: number;
    symbolExposureQty: number;
    dataSourceTimestamp: string;
  };
  positioning: {
    entryPrice: number;
    stopLoss: number;
    riskQty: number;
    capitalQty: number;
    targetQty: number;
    deltaQty: number;
  };
  scoring: {
    layerA: {
      passed: boolean;
      reasons: string[];
    };
    layerB: {
      technicalPosition: number;
      riskReward: number;
      sectorHotness: number;
    };
    total: number;
  };
  marketState: {
    trend: Trend;
    trendZh: string;
    price: number;
    ma5: number;
    ma10: number;
    ma20: number;
    high30: number;
    low30: number;
    priceVsMa5Pct: number;
    priceVsMa10Pct: number;
    safetyMarginPct: number;
    structurePass: boolean;
    structureReason: EtfBatchDecideStructureReason;
    structureReasonZh: string;
  };
  action: EtfBatchDecideAction;
  actionReasons: EtfBatchDecideActionReason[];
};

export type EtfBatchDecideErrorItem = {
  symbol?: string;
  code: EtfBatchDecideErrorCode;
  message: string;
  retryable?: boolean;
  stage?: "analyze" | "quote" | "sector" | "snapshot" | "global";
  attemptsUsed?: number;
  elapsedMs?: number;
  details?: Record<string, unknown>;
};

export type EtfBatchDecideResponse = {
  generatedAt: string;
  runMeta: {
    source: EtfProvider;
    days: number;
    timeout: number;
    riskPct: number;
    singleEtfExposureCapPct: number;
    total: number;
  };
  snapshotMeta: {
    snapshotUpdatedAt: string | null;
    snapshotAgeMs: number | null;
  };
  globalChecks: {
    status: "ok" | "aborted" | "failed";
    abortReason?: string;
    reasonCode?: EtfBatchDecideErrorCode;
  };
  results: EtfBatchDecideResultItem[];
  watchlist: string[];
  errors: EtfBatchDecideErrorItem[];
};
