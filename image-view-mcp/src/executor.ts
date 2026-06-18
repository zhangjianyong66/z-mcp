import type { ImageProviderConfig, ProviderAttempt, ProviderExecutionError, ProviderExecutor } from "./types.js";

function isProviderExecutionError(error: unknown): error is ProviderExecutionError {
  return Boolean(error && typeof error === "object" && "retryable" in error && "status" in error && "message" in error);
}

export async function executeWithFallback<TInput, TResult extends { provider: "dashscope"; model: string }>(input: {
  chain: ImageProviderConfig[];
  input: TInput;
  executor: ProviderExecutor<TInput, TResult>;
}): Promise<TResult & { attempts: ProviderAttempt[] }> {
  const attempts: ProviderAttempt[] = [];
  const failures: string[] = [];

  for (const config of input.chain) {
    try {
      const result = await input.executor({ config, input: input.input, attempts });
      attempts.push({ provider: config.provider, model: config.model, status: "success" });
      return { ...result, attempts };
    } catch (error) {
      if (!isProviderExecutionError(error)) {
        throw error;
      }

      attempts.push({ provider: config.provider, model: config.model, status: error.status });
      failures.push(`${config.provider}/${config.model} (${error.status})`);

      if (!error.retryable) {
        throw new Error(error.message);
      }
    }
  }

  throw new Error(`Image view request failed after ${attempts.length} attempts: ${failures.join("; ")}`);
}
