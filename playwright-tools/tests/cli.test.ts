import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL("../", import.meta.url));

async function createServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<html><head><title>CLI Fixture</title></head><body><p>cli</p></body></html>");
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

test("CLI open command prints page metadata", async () => {
  const server = await createServer();
  try {
    const { stdout } = await execFileAsync(
      "node",
      [
        "--import",
        "tsx",
        "src/main.ts",
        "open",
        server.url,
        "--headless",
        "true",
        "--wait-until",
        "domcontentloaded",
        "--text"
      ],
      {
        cwd: packageRoot,
        env: {
          ...process.env,
          PLAYWRIGHT_HEADLESS: "true"
        }
      }
    );

    const payload = JSON.parse(stdout) as { title: string; text: string; links: number };
    assert.equal(payload.title, "CLI Fixture");
    assert.match(payload.text, /cli/);
    assert.equal(payload.links, 0);
  } finally {
    await server.close();
  }
});
