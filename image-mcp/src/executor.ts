import type {
  ImageProviderConfig,
  ProviderAttempt,
  ProviderExecutionError,
  ProviderExecutor
} from "./types.js";

type ExecuteWithFallbackArgs<TInput, TResult extends { provider: ImageProviderConfig["provider"]; model: string }> = {
  chain: ImageProviderConfig[];
  input: TInput;
  executor: ProviderExecutor<TInput, TResult>;
};

function isProviderExecutionError(error: unknown): error is ProviderExecutionError {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as Record<string, unknown>;
  return (
    typeof candidate.retryable === "boolean" &&
    typeof candidate.status === "string" &&
    typeof candidate.message === "string"
  );
}

function buildAggregateError(attempts: ProviderAttempt[]): Error {
  const summary = attempts.map((attempt) => `${attempt.provider}/${attempt.model} (${attempt.status})`).join("; ");
  return new Error(`Image request failed after ${attempts.length} attempts: ${summary}`);
}

export async function executeWithFallback<TInput, TResult extends { provider: ImageProviderConfig["provider"]; model: string }>(
  args: ExecuteWithFallbackArgs<TInput, TResult>
): Promise<TResult & { attempts: ProviderAttempt[] }> {
  const attempts: ProviderAttempt[] = [];

  for (const config of args.chain) {
    try {
      const result = await args.executor({
        config,
        input: args.input,
        attempts: [...attempts]
      });
      return {
        ...result,
        attempts: [...attempts, { provider: config.provider, model: config.model, status: "success" }]
      };
    } catch (error) {
      if (!isProviderExecutionError(error)) {
        throw error;
      }

      if (!error.retryable) {
        throw new Error(error.message);
      }

      attempts.push({
        provider: config.provider,
        model: config.model,
        status: error.status
      });
    }
  }

  throw buildAggregateError(attempts);
}
