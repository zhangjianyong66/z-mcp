import { setTimeout as delay } from "node:timers/promises";
import { MinimaxApiError } from "./types.js";
async function requestWithRetry(config, method, pathname, body, maxRetries = 2) {
    let attempt = 0;
    let lastError;
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
            const payload = text ? JSON.parse(text) : {};
            const payloadRecord = payload && typeof payload === "object" ? payload : {};
            const baseResp = payloadRecord.base_resp && typeof payloadRecord.base_resp === "object"
                ? payloadRecord.base_resp
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
        }
        catch (error) {
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
    if (lastError instanceof Error)
        throw lastError;
    throw new Error(String(lastError));
}
export async function createLyrics(config, payload) {
    return requestWithRetry(config, "POST", "/v1/lyrics_generation", payload);
}
export async function createMusicTask(config, payload) {
    return requestWithRetry(config, "POST", "/v1/music_generation", payload);
}
export async function createCoverFeature(config, payload) {
    return requestWithRetry(config, "POST", "/v1/music_cover_preprocess", payload);
}
export async function getMusicTask(config, taskId) {
    return requestWithRetry(config, "GET", `/v1/music_generation?task_id=${encodeURIComponent(taskId)}`);
}
function readTaskStatus(payload) {
    const p = payload;
    const data = (p.data ?? p.output ?? p.result);
    const status = data?.status ?? p.status;
    return typeof status === "string" ? status.toLowerCase() : "unknown";
}
export async function pollMusicResult(config, taskId) {
    const deadline = Date.now() + config.pollTimeoutMs;
    let lastPayload;
    while (Date.now() <= deadline) {
        const payload = await getMusicTask(config, taskId);
        lastPayload = payload;
        const status = readTaskStatus(payload);
        if (["success", "succeeded", "done", "completed", "finished"].includes(status)) {
            return payload;
        }
        if (["failed", "error", "canceled", "cancelled"].includes(status)) {
            throw new Error(`MiniMax task failed with status: ${status}`);
        }
        await delay(config.pollIntervalMs);
    }
    throw new Error(`MiniMax task polling timeout for task_id=${taskId}; last payload: ${JSON.stringify(lastPayload)}`);
}
export function readTaskId(payload) {
    const p = payload;
    const data = (p.data ?? p.output ?? p.result);
    const taskId = p.task_id ?? data?.task_id ?? data?.taskId;
    return typeof taskId === "string" && taskId.trim() ? taskId : undefined;
}
