import { setTimeout as delay } from "node:timers/promises";
import type { MinimaxConfig } from "./types.js";
import { MinimaxApiError } from "./types.js";

type HttpMethod = "GET" | "POST";

async function requestWithRetry(
  config: MinimaxConfig,
  method: HttpMethod,
  pathname: string,
  body?: unknown,
  maxRetries = 2
): Promise<unknown> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    attempt += 1;

    try {
      const response = await fetch(`${config.baseURL}${pathname}`, {
        method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });

      const text = await response.text();
      const payload = text ? (JSON.parse(text) as unknown) : {};
      const payloadRecord = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const baseResp =
        payloadRecord.base_resp && typeof payloadRecord.base_resp === "object"
          ? (payloadRecord.base_resp as Record<string, unknown>)
          : undefined;
      const statusCode = typeof baseResp?.status_code === "number" ? baseResp.status_code : 0;

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new MinimaxApiError(`MiniMax request failed: HTTP ${response.status}`, response.status, retryable, payload);
      }

      if (statusCode !== 0) {
        const statusMsg = typeof baseResp?.status_msg === "string" ? baseResp.status_msg : "unknown";
        throw new MinimaxApiError(`MiniMax business error ${statusCode}: ${statusMsg}`, 400, false, payload);
      }

      return payload;
    } catch (error) {
      lastError = error;

      if (error instanceof MinimaxApiError && !error.retryable) {
        throw error;
      }

      if (attempt > maxRetries) {
        break;
      }

      await delay(400 * attempt);
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error(String(lastError));
}

export async function createLyrics(config: MinimaxConfig, payload: Record<string, unknown>): Promise<unknown> {
  return requestWithRetry(config, "POST", "/v1/lyrics_generation", payload);
}

export async function createMusicTask(config: MinimaxConfig, payload: Record<string, unknown>): Promise<unknown> {
  return requestWithRetry(config, "POST", "/v1/music_generation", payload);
}

export async function createCoverFeature(config: MinimaxConfig, payload: Record<string, unknown>): Promise<unknown> {
  return requestWithRetry(config, "POST", "/v1/music_cover_preprocess", payload);
}

export function readTaskId(payload: unknown): string | undefined {
  const p = payload as Record<string, unknown>;
  const data = (p.data ?? p.output ?? p.result) as Record<string, unknown> | undefined;
  const taskId = p.task_id ?? data?.task_id ?? data?.taskId;
  return typeof taskId === "string" && taskId.trim() ? taskId : undefined;
}
