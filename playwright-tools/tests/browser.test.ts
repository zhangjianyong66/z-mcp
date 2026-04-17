import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { once } from "node:events";
import { openPage, snapshotPage } from "../src/browser.js";

async function createServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html>
      <html>
        <head>
          <title>Playwright Fixture</title>
        </head>
        <body>
          <main>
            <h1>Fixture Page</h1>
            <p>hello playwright</p>
            <a href="/a">a</a>
            <a href="/b">b</a>
          </main>
        </body>
      </html>`);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to start fixture server");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}

test("openPage reads title, text, and link count", async () => {
  const server = await createServer();
  try {
    const result = await openPage(server.url, { headless: true, waitUntil: "domcontentloaded" });
    assert.equal(result.title, "Playwright Fixture");
    assert.match(result.text, /hello playwright/);
    assert.equal(result.links, 2);
  } finally {
    await server.close();
  }
});

test("snapshotPage returns a compact snapshot", async () => {
  const server = await createServer();
  try {
    const result = await snapshotPage(server.url, { headless: true, waitUntil: "domcontentloaded" });
    assert.equal(result.title, "Playwright Fixture");
    assert.match(result.text, /Fixture Page/);
    assert.equal(result.links, 2);
  } finally {
    await server.close();
  }
});
