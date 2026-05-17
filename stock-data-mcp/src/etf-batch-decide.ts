import { getPortfolioAndOrders } from "./portfolio-store.js";
import { runEtfBatchAnalyze, runEtfBatchQuote, runSectorList } from "./stock-data.js";
import { resolveSectorHotScore } from "./etf-sector-mapping.js";
import { getEtfUniverse } from "./etf-universe.js";
import { logStockDataEvent } from "./logging.js";
import type {
  EtfBatchDecideAction,
  EtfBatchAnalyzeResponse,
  EtfBatchDecideActionReason,
  EtfBatchDecideErrorCode,
  EtfBatchDecideInput,
  EtfBatchDecideResponse,
  PortfolioSnapshot,
  SectorListResponse,
  Trend,
  EtfBatchDecideErrorItem
} from "./types.js";

const DEFAULT_DAYS = 60;
const DEFAULT_TIMEOUT = 20;
const DEFAULT_RISK_PCT = 0.01;
const DEFAULT_SINGLE_CAP_PCT = 0.2;
const DEFAULT_THEME_CAP_PCT = 0.2;
const FIXED_SCORE_CALIBRATION_VERSION = "v2";
const LOT_SIZE = 100;
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;
const RETRY_MAX_DELAY_MS = 1_500;
const MIN_ATTEMPT_TIMEOUT_MS = 1_000;

type DecideDeps = {
  batchAnalyze?: typeof runEtfBatchAnalyze;
  batchQuote?: typeof runEtfBatchQuote;
  sectorList?: typeof runSectorList;
  portfolioSnapshot?: typeof getPortfolioAndOrders;
  etfUniverse?: typeof getEtfUniverse;
};

function normalizeSymbol(symbol: string): string {
  return symbol.replace(/^(SH|SZ)/i, "");
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function floorLot(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 0;
  }
  return Math.floor(quantity / LOT_SIZE) * LOT_SIZE;
}

function normalizeTheme(theme: string | null | undefined): string {
  const text = typeof theme === "string" ? theme.trim() : "";
  return text.length > 0 ? text : "unknown";
}

function buildError(code: EtfBatchDecideErrorCode, message: string, symbol?: string) {
  return {
    symbol,
    code,
    message,
    retryable: code === "TIMEOUT" || code === "PARTIAL_BATCH_FAIL"
  };
}

function classifyStageError(error: unknown): { code: EtfBatchDecideErrorCode; retryable: boolean } {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("abort") ||
    message.includes("budget exhausted")
  ) {
    return { code: "TIMEOUT", retryable: true };
  }
  if (message.includes("auth") || message.includes("401") || message.includes("403") || message.includes("cookie")) {
    return { code: "UPSTREAM_AUTH", retryable: false };
  }
  if (
    message.includes("invalid") ||
    message.includes("unsupported") ||
    message.includes("deprecated") ||
    message.includes("required")
  ) {
    return { code: "INVALID_INPUT", retryable: false };
  }
  if (
    message.includes("network") ||
    message.includes("reset") ||
    message.includes("503") ||
    message.includes("502") ||
    message.includes("500")
  ) {
    return { code: "UPSTREAM_TEMPORARY", retryable: true };
  }
  return { code: "INTERNAL_ERROR", retryable: false };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeRetryDelayMs(attempt: number): number {
  const exp = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * (2 ** Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exp * 0.2)));
  return Math.min(RETRY_MAX_DELAY_MS, exp + jitter);
}

async function retryWithBudget<T>(params: {
  stage: "analyze" | "quote" | "sector" | "snapshot";
  timeoutMs: number;
  startedAtMs: number;
  request: (attemptTimeoutSec: number) => Promise<T>;
}): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt += 1) {
    const elapsedMs = Date.now() - params.startedAtMs;
    const remainingBudgetMs = params.timeoutMs - elapsedMs;
    const remainingAttempts = RETRY_MAX_ATTEMPTS - attempt + 1;
    if (remainingBudgetMs <= MIN_ATTEMPT_TIMEOUT_MS) {
      const error = new Error(`timeout budget exhausted before stage ${params.stage} attempt ${attempt}`) as Error & {
        decideError?: EtfBatchDecideErrorItem;
      };
      error.decideError = {
        code: "TIMEOUT_BUDGET_EXHAUSTED",
        message: error.message,
        retryable: false,
        stage: params.stage,
        attemptsUsed: attempt - 1,
        elapsedMs
      };
      throw error;
    }

    const attemptTimeoutMs = Math.max(
      MIN_ATTEMPT_TIMEOUT_MS,
      Math.floor(remainingBudgetMs / remainingAttempts)
    );
    const attemptTimeoutSec = Math.max(1, Math.ceil(attemptTimeoutMs / 1000));
    try {
      return await params.request(attemptTimeoutSec);
    } catch (error) {
      lastError = error;
      const classified = classifyStageError(error);
      const isLastAttempt = attempt >= RETRY_MAX_ATTEMPTS;
      logStockDataEvent("etf_batch_decide.retry", {
        stage: params.stage,
        attempt,
        maxAttempts: RETRY_MAX_ATTEMPTS,
        attemptTimeoutMs,
        remainingBudgetMs,
        retryable: classified.retryable,
        code: classified.code,
        error: error instanceof Error ? error.message : String(error)
      }, classified.retryable ? "notice" : "warning");
      if (!classified.retryable || isLastAttempt) {
        const wrapped = error instanceof Error ? error : new Error(String(error));
        (wrapped as Error & { decideError?: EtfBatchDecideErrorItem }).decideError = {
          code: classified.code,
          message: wrapped.message,
          retryable: classified.retryable,
          stage: params.stage,
          attemptsUsed: attempt,
          elapsedMs: Date.now() - params.startedAtMs
        };
        throw wrapped;
      }
      const delayMs = computeRetryDelayMs(attempt);
      const nowRemaining = params.timeoutMs - (Date.now() - params.startedAtMs);
      if (nowRemaining <= delayMs + MIN_ATTEMPT_TIMEOUT_MS) {
        const budgetError = new Error(`timeout budget exhausted during ${params.stage} retries`) as Error & {
          decideError?: EtfBatchDecideErrorItem;
        };
        budgetError.decideError = {
          code: "TIMEOUT_BUDGET_EXHAUSTED",
          message: budgetError.message,
          retryable: false,
          stage: params.stage,
          attemptsUsed: attempt,
          elapsedMs: Date.now() - params.startedAtMs
        };
        throw budgetError;
      }
      await sleep(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function toMap<T extends { symbol: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(normalizeSymbol(item.symbol), item);
  }
  return map;
}

function inferHotScore(sectors: SectorListResponse): number {
  if (sectors.data.length === 0) {
    return 50;
  }
  const values = sectors.data.map((item) => item.hotScore).sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values[mid] ?? 50;
}

function hotScoreToSectionScore(hotScore: number, sectors: SectorListResponse, degraded: boolean): number {
  if (sectors.data.length === 0) {
    return degraded ? 10.2 : 12;
  }
  const values = sectors.data.map((item) => item.hotScore).sort((a, b) => b - a);
  const idx = values.findIndex((v) => v <= hotScore);
  const rank = idx === -1 ? values.length - 1 : idx;
  const pct = rank / Math.max(1, values.length - 1);

  let score = 3;
  if (pct <= 0.2) score = 20;
  else if (pct <= 0.4) score = 16;
  else if (pct <= 0.6) score = 12;
  else if (pct <= 0.8) score = 7;

  if (degraded) {
    score *= 0.85;
  }
  return round3(score);
}

function safetyMarginScoreV1(marginPct: number): number {
  if (marginPct <= 0.04) return 3;
  if (marginPct >= 0.12) return 12;
  const ratio = (marginPct - 0.04) / 0.08;
  return round3(3 + ratio * 9);
}

function safetyMarginScoreV2(marginPct: number): number {
  if (marginPct <= 0.04) return 4;
  if (marginPct >= 0.12) return 16;
  const ratio = (marginPct - 0.04) / 0.08;
  return round3(4 + ratio * 12);
}

function riskRewardScoreV1(r: number): number {
  if (!Number.isFinite(r) || r < 1) return 0;
  if (r >= 3) return 30;
  if (r <= 2) {
    const ratio = r - 1;
    return round3(10 + ratio * 12);
  }
  return round3(22 + (r - 2) * 8);
}

function riskRewardScoreV2(r: number): number {
  if (!Number.isFinite(r) || r < 0.7) return 0;
  if (r >= 3.2) return 30;
  if (r < 1.0) {
    const ratio = (r - 0.7) / 0.3;
    return round3(2 + ratio * 8);
  }
  if (r < 1.6) {
    const ratio = (r - 1.0) / 0.6;
    return round3(10 + ratio * 8);
  }
  if (r < 2.4) {
    const ratio = (r - 1.6) / 0.8;
    return round3(18 + ratio * 8);
  }
  const ratio = (r - 2.4) / 0.8;
  return round3(Math.min(30, 26 + ratio * 4));
}

function computeAtr20(recentKlines: EtfBatchAnalyzeResponse["results"][number]["recentKlines"]): number | null {
  if (!Array.isArray(recentKlines) || recentKlines.length < 2) {
    return null;
  }
  const window = recentKlines.slice(-20);
  if (window.length < 2) {
    return null;
  }

  const trs: number[] = [];
  for (let i = 1; i < window.length; i += 1) {
    const curr = window[i]!;
    const prev = window[i - 1]!;
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    if (Number.isFinite(tr) && tr >= 0) {
      trs.push(tr);
    }
  }
  if (trs.length === 0) {
    return null;
  }
  return trs.reduce((sum, value) => sum + value, 0) / trs.length;
}

function computeRiskReward(params: {
  useBalancedModel: boolean;
  entryPrice: number;
  stopLoss: number;
  high30: number;
  low30: number;
  recentKlines: EtfBatchAnalyzeResponse["results"][number]["recentKlines"];
}): number {
  const { useBalancedModel, entryPrice, stopLoss, high30, low30, recentKlines } = params;

  if (useBalancedModel) {
    const atr20 = computeAtr20(recentKlines);
    if (atr20 && atr20 > 0) {
      const target = Math.min(high30, entryPrice + 1.8 * atr20);
      const stop = Math.max(low30 * 0.94, entryPrice - 1.2 * atr20);
      const downside = entryPrice - stop;
      if (downside > 0) {
        return (target - entryPrice) / downside;
      }
    }
  }

  const downside = entryPrice - stopLoss;
  if (downside <= 0) {
    return 0;
  }
  return (high30 - entryPrice) / downside;
}

function hotScoreToSectionScoreV2(hotScore: number, sectors: SectorListResponse, degraded: boolean): number {
  if (sectors.data.length === 0) {
    return degraded ? 10.2 : 12;
  }
  const values = sectors.data.map((item) => item.hotScore).sort((a, b) => b - a);
  const idx = values.findIndex((v) => v <= hotScore);
  const rank = idx === -1 ? values.length - 1 : idx;
  const pct = rank / Math.max(1, values.length - 1);

  let score = 3;
  if (pct <= 0.3) score = 20;
  else if (pct <= 0.6) score = 16;
  else if (pct <= 0.8) score = 12;
  else if (pct <= 0.95) score = 7;

  if (degraded) {
    score *= 0.85;
  }
  return round3(score);
}

function technicalPositionScore(params: {
  trend: Trend;
  price: number;
  ma5: number;
  ma10: number;
  safetyMargin: number;
  scoreCalibrationVersion: "v1" | "v2";
}): number {
  const { trend, price, ma5, ma10, safetyMargin, scoreCalibrationVersion } = params;
  const nearMa10 = Math.abs(price - ma10) / price <= 0.015;

  if (scoreCalibrationVersion === "v2") {
    return round3(
      (trend === "bullish" ? 24 : 16) +
      (price <= ma5 ? 16 : (nearMa10 ? 10 : 0)) +
      safetyMarginScoreV2(safetyMargin)
    );
  }

  return round3(
    (trend === "bullish" ? 20 : 12) +
    (price <= ma5 ? 12 : (nearMa10 ? 8 : 0)) +
    safetyMarginScoreV1(safetyMargin)
  );
}

function detectUnitFailure(params: {
  currentPrice: number;
  positionQty: number;
  pendingBuyQty: number;
  totalCapital: number;
  availableCapital: number;
  marketValue: number;
}): string | null {
  if (params.currentPrice <= 0 || params.currentPrice >= 100) {
    return "price_unit_invalid";
  }
  if (!Number.isInteger(params.positionQty) || !Number.isInteger(params.pendingBuyQty)) {
    return "quantity_not_integer";
  }
  if (params.positionQty % LOT_SIZE !== 0 || params.pendingBuyQty % LOT_SIZE !== 0) {
    return "quantity_lot_mismatch";
  }
  if (params.totalCapital < 0 || params.availableCapital < 0 || params.marketValue < 0) {
    return "amount_unit_invalid";
  }
  return null;
}

function executionFrictionScore(params: {
  pendingBuyQty: number;
  pendingSellQty: number;
  deltaQty: number;
  targetQty: number;
  symbolExposureQty: number;
}): number {
  const { pendingBuyQty, pendingSellQty, deltaQty, targetQty, symbolExposureQty } = params;
  if (pendingBuyQty === 0 && pendingSellQty === 0 && targetQty >= LOT_SIZE) {
    return 10;
  }
  if (pendingBuyQty > 0 && deltaQty > 0 && pendingSellQty === 0) {
    return 7;
  }
  if (pendingBuyQty > 0 && (deltaQty < 0 || pendingSellQty > 0)) {
    return 4;
  }
  if (symbolExposureQty < LOT_SIZE || targetQty < LOT_SIZE) {
    return 1;
  }
  return 4;
}

function pickConstraintReasons(params: {
  unitFailed: boolean;
  targetQty: number;
  riskQty: number;
  capitalQty: number;
  symbolExposureQty: number;
  themeExposureQty: number;
}): EtfBatchDecideActionReason[] {
  const reasons: EtfBatchDecideActionReason[] = [];
  if (params.unitFailed) reasons.push("unit_mismatch");
  if (params.targetQty <= 0) {
    if (params.symbolExposureQty <= 0) reasons.push("single_exposure_limit");
    if (params.themeExposureQty <= 0) reasons.push("theme_exposure_limit");
    if (params.capitalQty <= 0) reasons.push("capital_limit");
    if (params.riskQty <= 0) reasons.push("risk_limit");
  }
  return reasons;
}

function collectActionReasons(params: {
  action: EtfBatchDecideAction;
  score: number;
  passedLayerA: boolean;
  pendingBuyQty: number;
  deltaQty: number;
  layerAReasons: string[];
  unitFailed: boolean;
  targetQty: number;
  riskQty: number;
  capitalQty: number;
  symbolExposureQty: number;
  themeExposureQty: number;
}): EtfBatchDecideActionReason[] {
  const constraintReasons = pickConstraintReasons({
    unitFailed: params.unitFailed,
    targetQty: params.targetQty,
    riskQty: params.riskQty,
    capitalQty: params.capitalQty,
    symbolExposureQty: params.symbolExposureQty,
    themeExposureQty: params.themeExposureQty
  });
  const reasonSet = new Set<EtfBatchDecideActionReason>();
  const map: Record<string, EtfBatchDecideActionReason> = {
    trend_not_tradeable: "trend_not_tradeable",
    structure_not_matched: "structure_not_matched",
    insufficient_safety_margin: "insufficient_safety_margin",
    risk_not_definable: "risk_not_definable",
    insufficient_exposure_room: "insufficient_exposure_room"
  };
  for (const raw of params.layerAReasons) {
    if (raw.startsWith("unit_mismatch")) {
      reasonSet.add("unit_mismatch");
      continue;
    }
    const mapped = map[raw];
    if (mapped) reasonSet.add(mapped);
  }
  for (const reason of constraintReasons) reasonSet.add(reason);

  if (params.action === "hold_watch") {
    if (params.passedLayerA && params.score < 70) {
      reasonSet.add("score_below_buy_threshold");
    }
    if (params.targetQty < LOT_SIZE) {
      reasonSet.add("target_qty_below_lot");
    }
    if (params.targetQty >= LOT_SIZE && params.deltaQty <= 0 && params.pendingBuyQty > 0) {
      reasonSet.add("pending_order_already_sufficient");
    }
  }
  if (["open_buy", "increase_buy", "replace_buy"].includes(params.action) && reasonSet.size === 0) {
    reasonSet.add("buy_signal_confirmed");
  }

  const priority: EtfBatchDecideActionReason[] = [
    "unit_mismatch",
    "trend_not_tradeable",
    "structure_not_matched",
    "insufficient_safety_margin",
    "risk_not_definable",
    "insufficient_exposure_room",
    "single_exposure_limit",
    "theme_exposure_limit",
    "capital_limit",
    "risk_limit",
    "score_below_buy_threshold",
    "target_qty_below_lot",
    "pending_order_already_sufficient",
    "buy_signal_confirmed",
    "unknown_reason"
  ];
  const ordered = priority.filter((reason) => reasonSet.has(reason));

  return ordered.length > 0 ? ordered : ["unknown_reason"];
}

function toAction(params: {
  score: number;
  passedLayerA: boolean;
  pendingBuyQty: number;
  deltaQty: number;
  targetQty: number;
  unitFailed: boolean;
}) {
  if (params.unitFailed) {
    return { action: "no_trade" as const };
  }
  if (!params.passedLayerA) {
    if (params.score >= 63) {
      return { action: "hold_watch" as const };
    }
    return { action: "no_trade" as const };
  }
  if (params.score < 70 || params.targetQty < LOT_SIZE) {
    return { action: "hold_watch" as const };
  }
  if (params.pendingBuyQty === 0) {
    return { action: "open_buy" as const };
  }
  if (params.deltaQty > 0) {
    return { action: "increase_buy" as const };
  }
  return { action: "replace_buy" as const };
}

function toTrendZh(trend: Trend): string {
  if (trend === "bullish") return "多头";
  if (trend === "bearish") return "空头";
  if (trend === "rangebound") return "震荡";
  if (trend === "insufficient_data") return "数据不足";
  return `${trend}（未定义中文标签）`;
}

function toStructureReason(params: {
  trend: Trend;
  structurePass: boolean;
}): "passed" | "trend_not_tradeable" | "price_above_ma5_and_far_from_ma10" | "unknown" {
  if (params.structurePass) return "passed";
  if (!["bullish", "rangebound"].includes(params.trend)) return "trend_not_tradeable";
  if (params.trend === "rangebound") return "price_above_ma5_and_far_from_ma10";
  return "unknown";
}

function toStructureReasonZh(reason: "passed" | "trend_not_tradeable" | "price_above_ma5_and_far_from_ma10" | "unknown"): string {
  if (reason === "passed") return "结构通过";
  if (reason === "trend_not_tradeable") return "趋势不可交易";
  if (reason === "price_above_ma5_and_far_from_ma10") return "价格高于MA5且偏离MA10过大";
  return "结构未知";
}

export async function runEtfBatchDecide(
  input: EtfBatchDecideInput,
  deps: DecideDeps = {},
  now: () => Date = () => new Date()
): Promise<EtfBatchDecideResponse> {
  const deprecatedRiskRewardModel = (input as EtfBatchDecideInput & { riskRewardModel?: unknown }).riskRewardModel;
  if (deprecatedRiskRewardModel !== undefined) {
    throw new Error("riskRewardModel is deprecated and unsupported.");
  }
  const days = input.days ?? DEFAULT_DAYS;
  const source = input.source ?? "xueqiu";
  const timeout = input.timeout ?? DEFAULT_TIMEOUT;
  const riskPct = input.riskPct ?? DEFAULT_RISK_PCT;
  const singleEtfExposureCapPct = input.singleEtfExposureCapPct ?? DEFAULT_SINGLE_CAP_PCT;
  const themeExposureCapPct = input.themeExposureCapPct ?? DEFAULT_THEME_CAP_PCT;
  const scoreCalibrationVersion = FIXED_SCORE_CALIBRATION_VERSION;
  const useBalancedModel = scoreCalibrationVersion === "v2";

  const batchAnalyze = deps.batchAnalyze ?? runEtfBatchAnalyze;
  const batchQuote = deps.batchQuote ?? runEtfBatchQuote;
  const sectorList = deps.sectorList ?? runSectorList;
  const portfolioSnapshot = deps.portfolioSnapshot ?? getPortfolioAndOrders;
  const etfUniverse = deps.etfUniverse ?? getEtfUniverse;
  const generatedAt = now().toISOString();
  const startedAtMs = Date.now();
  const timeoutMs = Math.max(1_000, Math.floor(timeout * 1000));
  const errors: EtfBatchDecideResponse["errors"] = [];
  const baseResponse = {
    generatedAt,
    runMeta: { source, days, timeout, riskPct, singleEtfExposureCapPct, themeExposureCapPct, total: input.symbols.length }
  };
  const failResponse = (error: EtfBatchDecideErrorItem): EtfBatchDecideResponse => ({
    ...baseResponse,
    snapshotMeta: {
      snapshotUpdatedAt: null,
      snapshotAgeMs: null
    },
    globalChecks: {
      status: "failed",
      reasonCode: error.code
    },
    results: [],
    watchlist: [],
    errors: [error]
  });

  let snapshot: PortfolioSnapshot;
  let analyze: EtfBatchAnalyzeResponse;
  let quote: Awaited<ReturnType<typeof batchQuote>>;
  let sectors: SectorListResponse;

  try {
    snapshot = await retryWithBudget({
      stage: "snapshot",
      timeoutMs,
      startedAtMs,
      request: async () => portfolioSnapshot()
    });
  } catch (error) {
    const decideError = (error as Error & { decideError?: EtfBatchDecideErrorItem }).decideError ?? {
      code: "UNKNOWN",
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
      stage: "snapshot"
    };
    return failResponse(decideError);
  }

  try {
    analyze = await retryWithBudget({
      stage: "analyze",
      timeoutMs,
      startedAtMs,
      request: async (attemptTimeoutSec) => batchAnalyze({ symbols: input.symbols, days, source, timeout: attemptTimeoutSec })
    });
  } catch (error) {
    const decideError = (error as Error & { decideError?: EtfBatchDecideErrorItem }).decideError ?? {
      code: "UNKNOWN",
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
      stage: "analyze"
    };
    return failResponse(decideError);
  }

  try {
    quote = await retryWithBudget({
      stage: "quote",
      timeoutMs,
      startedAtMs,
      request: async (attemptTimeoutSec) => batchQuote({ symbols: input.symbols, source, timeout: attemptTimeoutSec })
    });
  } catch (error) {
    const decideError = (error as Error & { decideError?: EtfBatchDecideErrorItem }).decideError ?? {
      code: "UNKNOWN",
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
      stage: "quote"
    };
    return failResponse(decideError);
  }

  try {
    sectors = await retryWithBudget({
      stage: "sector",
      timeoutMs,
      startedAtMs,
      request: async (attemptTimeoutSec) => sectorList({ sortBy: "hot", timeout: attemptTimeoutSec })
    });
  } catch (error) {
    const decideError = (error as Error & { decideError?: EtfBatchDecideErrorItem }).decideError ?? {
      code: "UNKNOWN",
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
      stage: "sector"
    };
    return failResponse(decideError);
  }

  if (!snapshot.portfolio) {
    return {
      ...baseResponse,
      snapshotMeta: {
        snapshotUpdatedAt: null,
        snapshotAgeMs: null
      },
      globalChecks: {
        status: "aborted",
        abortReason: "missing_account_snapshot"
      },
      results: [],
      watchlist: [],
      errors: [buildError("MISSING_ACCOUNT_SNAPSHOT", "portfolio snapshot is missing")]
    };
  }

  const snapshotAt = new Date(snapshot.portfolio.updatedAt).getTime();
  const snapshotAgeMs = Math.max(0, Date.parse(generatedAt) - snapshotAt);
  if (sectors.newsScoreDegraded) {
    errors.push(buildError("DOWNGRADED_NEWS_SCORE", "sector news score degraded"));
  }

  const analyzeMap = toMap(analyze.results);
  const quoteMap = toMap(quote.results);
  const hotScoreFallback = inferHotScore(sectors);

  if (analyze.errorCount > 0 || quote.errorCount > 0) {
    const partialErrors = [
      ...analyze.errors.map((e) => buildError("PARTIAL_BATCH_FAIL", e.error, e.symbol)),
      ...quote.errors.map((e) => buildError("PARTIAL_BATCH_FAIL", e.error, e.symbol))
    ];
    return {
      ...baseResponse,
      snapshotMeta: {
        snapshotUpdatedAt: snapshot.portfolio.updatedAt,
        snapshotAgeMs: Number.isFinite(snapshotAgeMs) ? snapshotAgeMs : null
      },
      globalChecks: {
        status: "failed",
        reasonCode: "PARTIAL_BATCH_FAIL"
      },
      results: [],
      watchlist: [],
      errors: partialErrors
    };
  }

  const themeBySymbol = new Map<string, string>();
  try {
    const universe = await etfUniverse();
    for (const item of universe) {
      themeBySymbol.set(normalizeSymbol(item.symbol), normalizeTheme(item.theme));
    }
  } catch (error) {
    logStockDataEvent("etf_batch_decide.theme_universe_unavailable", {
      error: error instanceof Error ? error.message : String(error)
    }, "warning");
  }

  const themeExposureState = new Map<string, { cap: number; exposure: number; room: number }>();
  const totalCapital = snapshot.portfolio.totalCapital;
  const themeCap = totalCapital * themeExposureCapPct;
  for (const symbol of input.symbols.map(normalizeSymbol)) {
    const theme = themeBySymbol.get(symbol) ?? "unknown";
    if (themeExposureState.has(theme)) continue;
    let exposure = 0;
    for (const position of snapshot.portfolio.positions) {
      const positionSymbol = normalizeSymbol(position.symbol);
      if ((themeBySymbol.get(positionSymbol) ?? "unknown") === theme) {
        exposure += position.marketValue;
      }
    }
    for (const order of snapshot.orders) {
      if (order.status !== "pending" || order.side !== "buy") continue;
      const orderSymbol = normalizeSymbol(order.symbol);
      if ((themeBySymbol.get(orderSymbol) ?? "unknown") !== theme) continue;
      const p = quoteMap.get(orderSymbol)?.data?.price ?? analyzeMap.get(orderSymbol)?.quote?.price;
      if (typeof p === "number" && Number.isFinite(p) && p > 0) {
        exposure += order.quantity * p;
      }
    }
    const room = Math.max(0, themeCap - exposure);
    themeExposureState.set(theme, { cap: themeCap, exposure, room });
  }

  const pendingItems: Array<{
    symbol: string;
    normalizedSymbol: string;
    name: string;
    unitFailure: string | null;
    trend: Trend;
    price: number;
    ma5: number;
    ma10: number;
    ma20: number;
    high30: number;
    low30: number;
    structurePass: boolean;
    structureReason: "passed" | "trend_not_tradeable" | "price_above_ma5_and_far_from_ma10" | "unknown";
    layerAReasons: string[];
    passedLayerA: boolean;
    technicalScore: number;
    riskReward: number;
    sectorScore: number;
    totalScore: number;
    positionMarketValue: number;
    pendingBuyQty: number;
    symbolExposure: number;
    symbolCap: number;
    symbolRatio: number;
    symbolExposureRoom: number;
    symbolExposureQty: number;
    entryPrice: number;
    stopLoss: number;
    riskQty: number;
    capitalQty: number;
    theme: string;
    themeCap: number;
    themeExposure: number;
    themeRatio: number;
    themeExposureRoom: number;
    themeExposureQty: number;
    targetQty: number;
    deltaQty: number;
    action: EtfBatchDecideAction;
    actionReasons: EtfBatchDecideActionReason[];
    priceVsMa5Pct: number;
    priceVsMa10Pct: number;
    safetyMargin: number;
  }> = [];
  let unitMismatchFound = false;

  for (const symbol of input.symbols.map(normalizeSymbol)) {
    const analyzeItem = analyzeMap.get(symbol);
    if (!analyzeItem) {
      errors.push(buildError("MISSING_REQUIRED_FIELD", "missing analyze payload", symbol));
      continue;
    }

    const q = quoteMap.get(symbol)?.data ?? analyzeItem.quote;
    const price = q.price ?? analyzeItem.indicators.current;
    const ma5 = analyzeItem.indicators.ma5;
    const ma10 = analyzeItem.indicators.ma10;
    const ma20 = analyzeItem.indicators.ma20;
    const high30 = analyzeItem.indicators.high30;
    const low30 = analyzeItem.indicators.low30;
    const trend = analyzeItem.indicators.trend;

    if (!price || !ma5 || !ma10 || !ma20 || !high30 || !low30) {
      errors.push(buildError("MISSING_REQUIRED_FIELD", "required market fields missing", symbol));
      continue;
    }

    const position = snapshot.portfolio.positions.find((item) => normalizeSymbol(item.symbol) === symbol);
    const pendingBuyQty = snapshot.orders
      .filter((o) => normalizeSymbol(o.symbol) === symbol && o.status === "pending" && o.side === "buy")
      .reduce((sum, o) => sum + o.quantity, 0);
    const pendingSellQty = snapshot.orders
      .filter((o) => normalizeSymbol(o.symbol) === symbol && o.status === "pending" && o.side === "sell")
      .reduce((sum, o) => sum + o.quantity, 0);

    const positionQty = position?.quantity ?? 0;
    const positionMarketValue = position?.marketValue ?? 0;
    const symbolCap = totalCapital * singleEtfExposureCapPct;
    const symbolExposure = positionMarketValue + pendingBuyQty * price;
    const symbolRatio = symbolCap > 0 ? symbolExposure / symbolCap : 0;

    const unitFailure = detectUnitFailure({
      currentPrice: price,
      positionQty,
      pendingBuyQty,
      totalCapital: snapshot.portfolio.totalCapital,
      availableCapital: snapshot.portfolio.availableCapital,
      marketValue: positionMarketValue
    });

    const entryPrice = Math.min(price, ma5 * 1.002);
    const stopLoss = low30 * 0.94;
    const unitRisk = entryPrice - stopLoss;
    const riskBudget = snapshot.portfolio.totalCapital * riskPct;
    const riskQty = unitRisk > 0 ? floorLot(riskBudget / unitRisk) : 0;
    const capitalQty = entryPrice > 0 ? floorLot(snapshot.portfolio.availableCapital / entryPrice) : 0;
    const symbolExposureRoom = Math.max(0, symbolCap - symbolExposure);
    const symbolExposureQty = entryPrice > 0 ? floorLot(symbolExposureRoom / entryPrice) : 0;
    const structurePass = trend === "bullish"
      ? true
      : (trend === "rangebound" && (price <= ma5 || Math.abs(price - ma10) / price <= 0.015));
    const safetyMargin = (high30 - price) / high30;
    const priceVsMa5Pct = price === 0 ? 0 : Math.abs((price - ma5) / price) * 100;
    const priceVsMa10Pct = price === 0 ? 0 : Math.abs((price - ma10) / price) * 100;

    const layerAReasons: string[] = [];
    if (!["bullish", "rangebound"].includes(trend)) layerAReasons.push("trend_not_tradeable");
    if (!structurePass) layerAReasons.push("structure_not_matched");
    if (safetyMargin < 0.04) layerAReasons.push("insufficient_safety_margin");
    if (!(stopLoss < entryPrice)) layerAReasons.push("risk_not_definable");
    if (symbolExposureQty < LOT_SIZE) layerAReasons.push("insufficient_exposure_room");
    if (unitFailure) layerAReasons.push(`unit_mismatch:${unitFailure}`);
    const passedLayerA = layerAReasons.length === 0;

    if (unitFailure) {
      unitMismatchFound = true;
      errors.push(buildError("UNIT_MISMATCH", unitFailure, symbol));
    }

    const technicalScore = technicalPositionScore({
      trend,
      price,
      ma5,
      ma10,
      safetyMargin,
      scoreCalibrationVersion
    });
    const rr = computeRiskReward({
      useBalancedModel,
      entryPrice,
      stopLoss,
      high30,
      low30,
      recentKlines: analyzeItem.recentKlines
    });
    const riskReward = scoreCalibrationVersion === "v2" ? riskRewardScoreV2(rr) : riskRewardScoreV1(rr);
    const mappedSector = resolveSectorHotScore(symbol, sectors);
    const hotScore = mappedSector?.hotScore ?? hotScoreFallback;
    const sectorScore = scoreCalibrationVersion === "v2"
      ? hotScoreToSectionScoreV2(hotScore, sectors, sectors.newsScoreDegraded)
      : hotScoreToSectionScore(hotScore, sectors, sectors.newsScoreDegraded);
    const friction = executionFrictionScore({ pendingBuyQty, pendingSellQty, deltaQty: 0, targetQty: LOT_SIZE, symbolExposureQty });
    const totalScore = round3(Math.min(100, technicalScore + riskReward + sectorScore + friction * 0.1));
    const structureReason = toStructureReason({ trend, structurePass });
    const theme = themeBySymbol.get(symbol) ?? "unknown";
    const themeState = themeExposureState.get(theme) ?? { cap: themeCap, exposure: 0, room: themeCap };
    pendingItems.push({
      symbol,
      normalizedSymbol: analyzeItem.normalizedSymbol,
      name: q.name ?? "",
      unitFailure,
      trend,
      price,
      ma5,
      ma10,
      ma20,
      high30,
      low30,
      structurePass,
      structureReason,
      layerAReasons,
      passedLayerA,
      technicalScore,
      riskReward,
      sectorScore,
      totalScore,
      positionMarketValue,
      pendingBuyQty,
      symbolExposure,
      symbolCap,
      symbolRatio,
      symbolExposureRoom,
      symbolExposureQty,
      entryPrice,
      stopLoss,
      riskQty,
      capitalQty,
      theme,
      themeCap: themeState.cap,
      themeExposure: themeState.exposure,
      themeRatio: themeState.cap > 0 ? themeState.exposure / themeState.cap : 0,
      themeExposureRoom: themeState.room,
      themeExposureQty: 0,
      targetQty: 0,
      deltaQty: 0,
      action: "no_trade",
      actionReasons: [],
      priceVsMa5Pct,
      priceVsMa10Pct,
      safetyMargin
    });
  }

  const byScore = [...pendingItems].sort((a, b) => b.totalScore - a.totalScore);
  const resultItems: EtfBatchDecideResponse["results"] = [];
  for (const item of byScore) {
    const themeState = themeExposureState.get(item.theme) ?? { cap: themeCap, exposure: 0, room: themeCap };
    const themeExposureQty = item.entryPrice > 0 ? floorLot(themeState.room / item.entryPrice) : 0;
    const targetQty = Math.max(0, Math.min(item.riskQty, item.capitalQty, item.symbolExposureQty, themeExposureQty));
    const deltaQty = targetQty - item.pendingBuyQty;
    const actionResult = toAction({
      score: item.totalScore,
      passedLayerA: item.passedLayerA,
      pendingBuyQty: item.pendingBuyQty,
      deltaQty,
      targetQty,
      unitFailed: Boolean(item.unitFailure)
    });
    const actionReasons = collectActionReasons({
      action: actionResult.action,
      score: item.totalScore,
      passedLayerA: item.passedLayerA,
      pendingBuyQty: item.pendingBuyQty,
      deltaQty,
      layerAReasons: item.layerAReasons,
      unitFailed: Boolean(item.unitFailure),
      targetQty,
      riskQty: item.riskQty,
      capitalQty: item.capitalQty,
      symbolExposureQty: item.symbolExposureQty,
      themeExposureQty
    });
    if (targetQty > 0) {
      const allocated = targetQty * item.entryPrice;
      themeState.exposure += allocated;
      themeState.room = Math.max(0, themeState.room - allocated);
      themeExposureState.set(item.theme, themeState);
    }
    resultItems.push({
      symbol: item.symbol,
      normalizedSymbol: item.normalizedSymbol,
      name: item.name,
      unitCheck: {
        status: item.unitFailure ? "fail" : "pass",
        reason: item.unitFailure
      },
      exposureMetrics: {
        positionMarketValue: round3(item.positionMarketValue),
        pendingBuyQty: item.pendingBuyQty,
        currentPriceUsed: round3(item.price),
        symbolExposure: round3(item.symbolExposure),
        symbolCap: round3(item.symbolCap),
        symbolRatio: round3(item.symbolRatio),
        symbolExposureRoom: round3(item.symbolExposureRoom),
        symbolExposureQty: item.symbolExposureQty,
        theme: item.theme,
        themeExposure: round3(item.themeExposure),
        themeCap: round3(item.themeCap),
        themeRatio: round3(item.themeRatio),
        themeExposureRoom: round3(item.themeExposureRoom),
        themeExposureQty,
        dataSourceTimestamp: snapshot.portfolio.updatedAt
      },
      positioning: {
        entryPrice: round3(item.entryPrice),
        stopLoss: round3(item.stopLoss),
        riskQty: item.riskQty,
        capitalQty: item.capitalQty,
        targetQty,
        deltaQty
      },
      scoring: {
        layerA: {
          passed: item.passedLayerA,
          reasons: item.layerAReasons
        },
        layerB: {
          technicalPosition: item.technicalScore,
          riskReward: item.riskReward,
          sectorHotness: item.sectorScore
        },
        total: item.totalScore
      },
      marketState: {
        trend: item.trend,
        trendZh: toTrendZh(item.trend),
        price: round3(item.price),
        ma5: round3(item.ma5),
        ma10: round3(item.ma10),
        ma20: round3(item.ma20),
        high30: round3(item.high30),
        low30: round3(item.low30),
        priceVsMa5Pct: round2(item.priceVsMa5Pct),
        priceVsMa10Pct: round2(item.priceVsMa10Pct),
        safetyMarginPct: round2(item.safetyMargin * 100),
        structurePass: item.structurePass,
        structureReason: item.structureReason,
        structureReasonZh: toStructureReasonZh(item.structureReason)
      },
      action: actionResult.action,
      actionReasons
    });
  }

  const sorted = [...resultItems].sort((a, b) => b.scoring.total - a.scoring.total);
  const watchlist = sorted.filter((item) => item.scoring.total >= 63 && item.scoring.total < 70).map((item) => item.symbol);

  if (unitMismatchFound) {
    return {
      ...baseResponse,
      snapshotMeta: {
        snapshotUpdatedAt: snapshot.portfolio.updatedAt,
        snapshotAgeMs: Number.isFinite(snapshotAgeMs) ? snapshotAgeMs : null
      },
      globalChecks: {
        status: "aborted",
        abortReason: "unit_mismatch"
      },
      results: sorted,
      watchlist: [],
      errors
    };
  }

  return {
    ...baseResponse,
    snapshotMeta: {
      snapshotUpdatedAt: snapshot.portfolio.updatedAt,
      snapshotAgeMs: Number.isFinite(snapshotAgeMs) ? snapshotAgeMs : null
    },
    globalChecks: {
      status: "ok"
    },
    results: sorted,
    watchlist,
    errors
  };
}

export type { DecideDeps, PortfolioSnapshot, EtfBatchAnalyzeResponse };
