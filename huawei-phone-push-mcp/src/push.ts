import { randomUUID } from "node:crypto";
import { AppError, type PushTaskInput, type PushTaskOutput } from "./types.js";

type PushRequestConfig = {
  authCode: string;
  pushUrl: string;
  timeoutSec: number;
};

function maybeParseJson(text: string): unknown {
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function buildTraceId(): string {
  return `huawei-phone-push-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
}

function extractBusinessCode(payload: unknown): string | number | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const value = (payload as Record<string, unknown>).code;
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  return undefined;
}

function extractBusinessMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const data = payload as Record<string, unknown>;
  const desc = data.desc;
  if (typeof desc === "string" && desc.trim().length > 0) {
    return desc;
  }
  const message = data.message;
  if (typeof message === "string" && message.trim().length > 0) {
    return message;
  }
  return undefined;
}

function isBusinessSuccess(code: string | number): boolean {
  return code === "0000000000" || code === "0" || code === 0;
}

export async function pushTaskResult(
  input: PushTaskInput,
  config: PushRequestConfig
): Promise<PushTaskOutput> {
  const traceId = buildTraceId();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutSec * 1000);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
      "User-Agent": "huawei-phone-push-mcp/0.1.0",
      "x-trace-id": traceId
    };

    const payload = { data: { authCode: config.authCode, msgContent: input.msgContent } };

    const response = await fetch(config.pushUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const bodyText = await response.text();
    const body = maybeParseJson(bodyText);

    if (!response.ok) {
      throw new AppError("upstream_error", `push service returned HTTP ${response.status}`, {
        status: response.status,
        traceId,
        response: body
      });
    }

    const businessCode = extractBusinessCode(body);
    if (businessCode === undefined) {
      throw new AppError("upstream_error", "push service response missing business code", {
        status: response.status,
        traceId,
        response: body
      });
    }

    const businessMessage = extractBusinessMessage(body) ?? "ok";
    if (!isBusinessSuccess(businessCode)) {
      throw new AppError("upstream_error", `push service business error: ${businessMessage}`, {
        status: response.status,
        traceId,
        businessCode,
        businessMessage,
        response: body
      });
    }

    return {
      status: response.status,
      ok: true,
      traceId,
      businessCode,
      businessMessage,
      response: body
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("timeout", `push request timed out after ${config.timeoutSec}s`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new AppError("http_error", `push request failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}
