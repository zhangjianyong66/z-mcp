import "dotenv/config";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { pushTaskResult } from "./push.js";
import { RecordStore } from "./record-store.js";
import { AppError, type PushMessage, type PushRecord, type ToolCode, type ToolResponse } from "./types.js";

const config = loadConfig();
const recordStore = new RecordStore({
  enabled: config.saveRecords,
  limit: config.recordsLimit,
  dir: config.recordsDir,
  file: config.recordsFile
});

const server = new McpServer({
  name: "推送到华为手机mcp",
  version: "0.1.0"
});

function ok<T>(message: string, data: T, meta?: Record<string, unknown>): ToolResponse<T> {
  return {
    success: true,
    code: "ok",
    message,
    data,
    ...(meta ? { meta } : {})
  };
}

function fail(code: ToolCode, message: string, meta?: Record<string, unknown>): ToolResponse<null> {
  return {
    success: false,
    code,
    message,
    data: null,
    ...(meta ? { meta } : {})
  };
}

function toPayload(response: ToolResponse): { content: Array<{ type: "text"; text: string }>; isError?: true } {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(response, null, 2)
      }
    ],
    ...(!response.success ? { isError: true as const } : {})
  };
}

function toFailure(error: unknown, requestId: string): ToolResponse<null> {
  if (error instanceof AppError) {
    return fail(error.code, error.message, {
      request_id: requestId,
      ...(error.meta ?? {})
    });
  }
  return fail("internal_error", error instanceof Error ? error.message : String(error), {
    request_id: requestId
  });
}

function buildPushMessage(scheduleTaskName: string, content: string): PushMessage {
  const nowSec = Math.floor(Date.now() / 1000);
  const id = randomUUID();
  return {
    msgId: id,
    scheduleTaskId: id,
    scheduleTaskName,
    summary: scheduleTaskName,
    result: "已完成",
    content,
    source: "OpenClaw",
    taskFinishTime: nowSec
  };
}

server.tool(
  "push_to_huawei_phone",
  "将任务内容推送到华为手机负一屏（鉴权码从环境变量读取）。",
  {
    scheduleTaskName: z.string().min(1),
    content: z.string().min(1)
  },
  async ({ scheduleTaskName, content }) => {
    const requestId = randomUUID();
    const started = Date.now();
    const msgContent = [buildPushMessage(scheduleTaskName, content)];
    const firstMessage = msgContent[0];

    try {
      const result = await pushTaskResult(
        {
          msgContent
        },
        {
          authCode: config.authCode,
          pushUrl: config.pushUrl,
          timeoutSec: config.timeoutSec
        }
      );

      const durationMs = Date.now() - started;
      const successResponse = ok("ok", result, {
        request_id: requestId,
        duration_ms: durationMs
      });

      const record: PushRecord = {
        requestId,
        createdAt: new Date().toISOString(),
        endpoint: config.pushUrl,
        traceId: result.traceId,
        taskName: firstMessage?.scheduleTaskName ?? "unknown",
        msgId: firstMessage?.msgId,
        scheduleTaskId: firstMessage?.scheduleTaskId,
        success: true,
        code: "ok",
        message: "ok",
        businessCode: result.businessCode,
        businessMessage: result.businessMessage,
        durationMs,
        httpStatus: result.status
      };
      await recordStore.save(record);

      return toPayload(successResponse);
    } catch (error) {
      const durationMs = Date.now() - started;
      const failure = toFailure(error, requestId);

      const record: PushRecord = {
        requestId,
        createdAt: new Date().toISOString(),
        endpoint: config.pushUrl,
        traceId: typeof failure.meta?.traceId === "string" ? failure.meta.traceId : "unknown",
        taskName: firstMessage?.scheduleTaskName ?? "unknown",
        msgId: firstMessage?.msgId,
        scheduleTaskId: firstMessage?.scheduleTaskId,
        success: false,
        code: failure.code,
        message: failure.message,
        businessCode:
          typeof failure.meta?.businessCode === "string" || typeof failure.meta?.businessCode === "number"
            ? (failure.meta.businessCode as string | number)
            : undefined,
        businessMessage: typeof failure.meta?.businessMessage === "string" ? failure.meta.businessMessage : undefined,
        durationMs,
        httpStatus: typeof failure.meta?.status === "number" ? (failure.meta.status as number) : undefined
      };
      await recordStore.save(record);

      return toPayload(failure);
    }
  }
);

server.tool(
  "get_push_history",
  "查询本地推送历史记录（用于排障与审计）。",
  {
    page: z.number().int().min(1).optional().default(1),
    page_size: z.number().int().min(1).max(100).optional().default(20)
  },
  async ({ page, page_size }) => {
    const requestId = randomUUID();
    try {
      const result = await recordStore.list(page, page_size);
      return toPayload(ok("ok", result, { request_id: requestId }));
    } catch (error) {
      return toPayload(toFailure(error, requestId));
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
