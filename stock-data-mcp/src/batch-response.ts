import type {
  EtfBatchAnalyzeResponse,
  EtfBatchKlineResponse,
  EtfBatchQuoteResponse
} from "./types.js";

type BatchResponse = EtfBatchQuoteResponse | EtfBatchKlineResponse | EtfBatchAnalyzeResponse;

export function compressBatchResult<T extends BatchResponse>(
  result: T
): Omit<T, "errors"> & { errors?: T["errors"] } {
  if (result.errorCount > 0) {
    return result;
  }

  const { errors: _errors, ...rest } = result;
  return rest;
}
