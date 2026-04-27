import { AppError } from "./types.js";

export type TodoConfig = {
  dbFile: string;
};

export function loadConfig(): TodoConfig {
  const dbFile = process.env.TODO_MCP_DB_FILE?.trim();
  if (!dbFile) {
    throw new AppError("config_error", "Missing required env TODO_MCP_DB_FILE");
  }

  return { dbFile };
}
