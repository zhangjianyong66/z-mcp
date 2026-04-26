import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { pushTaskResult } from "../src/push.js";

test("pushTaskResult sends wrapped payload with trace header", async () => {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          code: "0000000000",
          desc: "ok",
          trace: req.headers["x-trace-id"],
          body: JSON.parse(body)
        })
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to allocate test port");
  }

  try {
    const result = await pushTaskResult(
      {
        msgContent: [
          {
            msgId: "msg_1",
            scheduleTaskId: "schedule_1",
            scheduleTaskName: "demo",
            summary: "demo",
            result: "done",
            content: "content",
            source: "OpenClaw",
            taskFinishTime: 1770000000
          }
        ]
      },
      {
        authCode: "secret",
        pushUrl: `http://127.0.0.1:${address.port}`,
        timeoutSec: 3
      }
    );

    assert.equal(result.status, 200);
    assert.equal(result.businessCode, "0000000000");
    assert.equal(result.businessMessage, "ok");
    assert.match(result.traceId, /^huawei-phone-push-/);
    const payload = result.response as {
      trace: string;
      body: { data: { authCode: string; msgContent: Array<{ scheduleTaskName: string }> } };
    };
    assert.equal(payload.trace, result.traceId);
    assert.equal(payload.body.data.authCode, "secret");
    assert.equal(payload.body.data.msgContent[0]?.scheduleTaskName, "demo");
  } finally {
    server.close();
  }
});

test("pushTaskResult throws on non-2xx response", async () => {
  const server = createServer((_req, res) => {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "oops" }));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to allocate test port");
  }

  try {
    await assert.rejects(
      () =>
        pushTaskResult(
          {
            msgContent: [
              {
                msgId: "msg_1",
                scheduleTaskId: "schedule_1",
                scheduleTaskName: "demo",
                summary: "demo",
                result: "done",
                content: "content",
                source: "OpenClaw",
                taskFinishTime: 1770000000
              }
            ]
          },
          {
            authCode: "secret",
            pushUrl: `http://127.0.0.1:${address.port}`,
            timeoutSec: 3
          }
        ),
      /HTTP 500/
    );
  } finally {
    server.close();
  }
});

test("pushTaskResult treats non-success business code as error", async () => {
  const server = createServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ code: "0000500001", desc: "Parameter x-trace-id is empty" }));
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to allocate test port");
  }

  try {
    await assert.rejects(
      () =>
        pushTaskResult(
          {
            msgContent: [
              {
                msgId: "msg_1",
                scheduleTaskId: "schedule_1",
                scheduleTaskName: "demo",
                summary: "demo",
                result: "done",
                content: "content",
                source: "OpenClaw",
                taskFinishTime: 1770000000
              }
            ]
          },
          {
            authCode: "secret",
            pushUrl: `http://127.0.0.1:${address.port}`,
            timeoutSec: 3
          }
        ),
      /business error/
    );
  } finally {
    server.close();
  }
});
