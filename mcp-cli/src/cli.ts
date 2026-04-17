import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, type StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit } from "node:process";

export type ServerPresetName = "image" | "search" | "stock-data";
export type RunMode = "dev" | "dist";
export type CommandName = "inspect" | "list-tools" | "call-tool";

export type ServerTarget = {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
};

export type CliOptions =
  | {
      command: "inspect" | "list-tools";
      server: ServerTarget;
    }
  | {
      command: "call-tool";
      server: ServerTarget;
      toolName: string;
      input: Record<string, unknown>;
    };

const SERVER_PRESETS: Record<ServerPresetName, { dir: string }> = {
  image: { dir: "image-mcp" },
  search: { dir: "search-mcp" },
  "stock-data": { dir: "stock-data-mcp" }
};

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function isServerPresetName(value: string): value is ServerPresetName {
  return value in SERVER_PRESETS;
}

function isMode(value: string): value is RunMode {
  return value === "dev" || value === "dist";
}

function toUsage(): string {
  return [
    "Usage:",
    "  mcp-cli inspect <server> [--mode dev|dist]",
    "  mcp-cli list-tools <server> [--mode dev|dist]",
    "  mcp-cli call-tool <server> <tool> --input '{\"key\":\"value\"}' [--mode dev|dist]",
    "",
    "Servers:",
    "  image | search | stock-data",
    "",
    "Options:",
    "  --mode dev|dist   Select how to launch the server. Default: dev",
    "  --cwd <path>      Override server working directory",
    "  --command <cmd>   Override server command",
    "  --args <json>     Override server args as a JSON array",
    "  --input <json>    Tool input for call-tool",
    "  --json            Reserved for compatibility; output is JSON by default"
  ].join("\n");
}

function parseJsonObject(value: string, flagName: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${flagName}: ${message}`);
  }
}

function parseJsonArray(value: string, flagName: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      throw new Error("expected a JSON array of strings");
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${flagName}: ${message}`);
  }
}

export function resolveServerTarget(input: {
  serverName: string;
  mode?: RunMode;
  cwdOverride?: string;
  commandOverride?: string;
  argsOverride?: string[];
}): ServerTarget {
  const mode = input.mode ?? "dev";
  const presetName = input.serverName;
  const preset = isServerPresetName(presetName) ? SERVER_PRESETS[presetName] : null;

  if (!preset && !input.cwdOverride) {
    throw new Error(`Unknown server preset: ${presetName}`);
  }

  const targetDir = input.cwdOverride ?? resolve(PACKAGE_ROOT, "..", preset!.dir);
  const command = input.commandOverride ?? "node";
  const args =
    input.argsOverride ??
    (mode === "dev" ? ["--import", "tsx", "src/index.ts"] : ["dist/index.js"]);

  return {
    name: presetName,
    command,
    args,
    cwd: targetDir
  };
}

export function parseArgs(argvInput: string[]): CliOptions {
  if (argvInput.length === 0) {
    throw new Error(toUsage());
  }

  const [command, ...rest] = argvInput;
  if (command !== "inspect" && command !== "list-tools" && command !== "call-tool") {
    throw new Error(toUsage());
  }

  let mode: RunMode | undefined;
  let cwdOverride: string | undefined;
  let commandOverride: string | undefined;
  let argsOverride: string[] | undefined;
  let inputJson: Record<string, unknown> | undefined;
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token) {
      continue;
    }
    if (token === "--mode") {
      const value = rest[++index];
      if (!value || !isMode(value)) {
        throw new Error("Expected --mode dev|dist");
      }
      mode = value;
      continue;
    }
    if (token === "--cwd") {
      const value = rest[++index];
      if (!value) {
        throw new Error("Expected --cwd <path>");
      }
      cwdOverride = value;
      continue;
    }
    if (token === "--command") {
      const value = rest[++index];
      if (!value) {
        throw new Error("Expected --command <cmd>");
      }
      commandOverride = value;
      continue;
    }
    if (token === "--args") {
      const value = rest[++index];
      if (!value) {
        throw new Error("Expected --args <json-array>");
      }
      argsOverride = parseJsonArray(value, "--args");
      continue;
    }
    if (token === "--input") {
      const value = rest[++index];
      if (!value) {
        throw new Error("Expected --input <json>");
      }
      inputJson = parseJsonObject(value, "--input");
      continue;
    }
    if (token === "--json") {
      continue;
    }
    if (token.startsWith("--")) {
      throw new Error(`Unknown option: ${token}`);
    }
    positional.push(token);
  }

  if (positional.length < 1) {
    throw new Error(toUsage());
  }

  const serverName = positional[0];
  if (!serverName) {
    throw new Error(toUsage());
  }

  const server = resolveServerTarget({
    serverName,
    mode,
    cwdOverride,
    commandOverride,
    argsOverride
  });

  if (command === "call-tool") {
    const toolName = positional[1];
    if (!toolName) {
      throw new Error("call-tool requires a tool name");
    }
    return {
      command,
      server,
      toolName,
      input: inputJson ?? {}
    };
  }

  if (positional.length !== 1) {
    throw new Error(`Unexpected extra arguments: ${positional.slice(1).join(" ")}`);
  }

  return {
    command,
    server
  };
}

async function connectClient(server: ServerTarget): Promise<{ client: Client; transport: StdioClientTransport }> {
  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args,
    cwd: server.cwd,
    env: server.env
  } satisfies StdioServerParameters);
  const client = new Client({
    name: "z-mcp-cli",
    version: "0.1.0"
  });
  await client.connect(transport);
  return { client, transport };
}

export async function runCli(options: CliOptions): Promise<unknown> {
  const { client, transport } = await connectClient(options.server);
  try {
    switch (options.command) {
      case "inspect": {
        const [version, capabilities, instructions] = await Promise.all([
          Promise.resolve(client.getServerVersion()),
          Promise.resolve(client.getServerCapabilities()),
          Promise.resolve(client.getInstructions())
        ]);
        return {
          server: options.server.name,
          version,
          capabilities,
          instructions
        };
      }
      case "list-tools": {
        const [version, capabilities, tools] = await Promise.all([
          Promise.resolve(client.getServerVersion()),
          Promise.resolve(client.getServerCapabilities()),
          client.listTools()
        ]);
        return {
          server: options.server.name,
          version,
          capabilities,
          tools
        };
      }
      case "call-tool": {
        const result = await client.callTool({
          name: options.toolName,
          arguments: options.input
        });
        return {
          server: options.server.name,
          tool: options.toolName,
          input: options.input,
          result
        };
      }
    }
  } finally {
    await transport.close();
  }
}

export async function main(argvValues: string[] = argv.slice(2)): Promise<void> {
  try {
    const options = parseArgs(argvValues);
    const output = await runCli(options);
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    exit(1);
  }
}
