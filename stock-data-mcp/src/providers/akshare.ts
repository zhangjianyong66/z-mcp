import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";
import type {
  NormalizedSectorListInput,
  SectorProviderApi,
  SectorSnapshotItem,
  StockDataLogContext
} from "../types.js";
import { logStockDataEvent } from "../logging.js";

const execFileAsync = promisify(execFile);

type AksharePayload = {
  source?: string;
  data?: unknown;
};

export type AkshareRunner = (timeoutMs: number, context?: StockDataLogContext) => Promise<unknown>;

type AkshareProviderOptions = {
  runner?: AkshareRunner;
  scriptPath?: string;
};

type RunnerErrorDetails = {
  type: "timeout" | "process_error" | "empty_stdout" | "missing_dependency" | "unknown_error";
  pythonBin: string;
  scriptPath: string;
  exitCode?: number | null;
  signal?: string | null;
  killed?: boolean;
  stderrSnippet?: string;
  stdoutSnippet?: string;
};

function resolvePythonBin(): string {
  const fromEnv = process.env.AKSHARE_PYTHON_BIN?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return "python3";
}

function resolveScriptPath(explicitPath?: string): string {
  if (explicitPath?.trim()) {
    return explicitPath;
  }

  const fromEnv = process.env.AKSHARE_SECTOR_SCRIPT_PATH?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../scripts/akshare_sector_summary.py"
  );
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "-") {
      return null;
    }
    const parsed = Number(trimmed.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") {
    return null;
  }
  return trimmed;
}

function mapAkshareSectorItem(raw: Record<string, unknown>): SectorSnapshotItem | null {
  const sectorName = toStringOrNull(raw.sectorName);
  if (!sectorName) {
    return null;
  }

  return {
    sectorName,
    changePercent: toNumber(raw.changePercent),
    upCount: toNumber(raw.upCount),
    downCount: toNumber(raw.downCount),
    amount: toNumber(raw.amount),
    netInflow: toNumber(raw.netInflow),
    leaderStock: toStringOrNull(raw.leaderStock),
    leaderLatestPrice: toNumber(raw.leaderLatestPrice),
    leaderChangePercent: toNumber(raw.leaderChangePercent)
  };
}

function parseAksharePayload(payload: unknown): SectorSnapshotItem[] {
  const normalized: AksharePayload =
    payload && typeof payload === "object"
      ? (payload as AksharePayload)
      : { data: payload };

  const rows = Array.isArray(normalized.data)
    ? normalized.data
    : Array.isArray(payload)
      ? payload
      : [];

  if (!rows.length) {
    throw new Error("akshare returned empty sector list");
  }

  return rows
    .map((row) => (row && typeof row === "object" ? mapAkshareSectorItem(row as Record<string, unknown>) : null))
    .filter((item): item is SectorSnapshotItem => item !== null);
}

async function defaultRunnerFactory(scriptPath: string): Promise<AkshareRunner> {
  const pythonBin = resolvePythonBin();

  const buildRunnerError = (message: string, details: RunnerErrorDetails): Error => {
    const error = new Error(message) as Error & { details?: RunnerErrorDetails };
    error.details = details;
    return error;
  };

  return async (timeoutMs: number, context?: StockDataLogContext) => {
    logStockDataEvent("akshare.runner.start", {
      requestId: context?.requestId,
      pythonBin,
      scriptPath,
      timeoutMs
    }, "debug");

    try {
      const { stdout, stderr } = await execFileAsync(pythonBin, [scriptPath], {
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        env: process.env
      });

      if (stderr?.trim()) {
        logStockDataEvent("akshare.runner.stderr", {
          requestId: context?.requestId,
          stderr: stderr.trim().slice(0, 500)
        }, "debug");
      }

      if (!stdout?.trim()) {
        throw buildRunnerError("akshare returned empty stdout", {
          type: "empty_stdout",
          pythonBin,
          scriptPath,
          stderrSnippet: stderr?.trim().slice(0, 500),
          stdoutSnippet: stdout?.trim().slice(0, 500)
        });
      }

      return JSON.parse(stdout);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorObject = error as {
        code?: string | number;
        signal?: string | null;
        killed?: boolean;
        stderr?: string;
        stdout?: string;
      };
      const stderrSnippet = typeof errorObject.stderr === "string" ? errorObject.stderr.trim().slice(0, 500) : undefined;
      const stdoutSnippet = typeof errorObject.stdout === "string" ? errorObject.stdout.trim().slice(0, 500) : undefined;
      const isTimeout = errorObject.code === "ETIMEDOUT" || message.toLowerCase().includes("timed out");

      if (message.includes("No module named 'akshare'") || message.includes('No module named "akshare"')) {
        throw buildRunnerError(
          `akshare python execution failed: missing python dependency 'akshare' in ${pythonBin}. ` +
          `Install with: ${pythonBin} -m pip install -U akshare. Raw error: ${message}`,
          {
            type: "missing_dependency",
            pythonBin,
            scriptPath,
            exitCode: typeof errorObject.code === "number" ? errorObject.code : undefined,
            signal: errorObject.signal ?? null,
            killed: errorObject.killed,
            stderrSnippet,
            stdoutSnippet
          }
        );
      }

      if (isTimeout) {
        throw buildRunnerError(
          `akshare python execution timed out (python=${pythonBin}, timeoutMs=${timeoutMs}): ${message}`,
          {
            type: "timeout",
            pythonBin,
            scriptPath,
            exitCode: typeof errorObject.code === "number" ? errorObject.code : null,
            signal: errorObject.signal ?? null,
            killed: errorObject.killed,
            stderrSnippet,
            stdoutSnippet
          }
        );
      }

      throw buildRunnerError(`akshare python execution failed (python=${pythonBin}): ${message}`, {
        type: "process_error",
        pythonBin,
        scriptPath,
        exitCode: typeof errorObject.code === "number" ? errorObject.code : undefined,
        signal: errorObject.signal ?? null,
        killed: errorObject.killed,
        stderrSnippet,
        stdoutSnippet
      });
    }
  };
}

export function createAkshareProvider(options: AkshareProviderOptions = {}): SectorProviderApi {
  const scriptPath = resolveScriptPath(options.scriptPath);
  let runnerPromise: Promise<AkshareRunner> | null = null;

  const resolveRunner = (): Promise<AkshareRunner> => {
    if (options.runner) {
      return Promise.resolve(options.runner);
    }
    if (!runnerPromise) {
      runnerPromise = defaultRunnerFactory(scriptPath);
    }
    return runnerPromise;
  };

  return {
    async listIndustrySummary(input: NormalizedSectorListInput, context?: StockDataLogContext): Promise<SectorSnapshotItem[]> {
      const runner = await resolveRunner();
      const payload = await runner(input.timeoutMs, context);
      const items = parseAksharePayload(payload);
      if (!items.length) {
        throw new Error("akshare returned no valid sector items");
      }
      return items;
    }
  };
}
