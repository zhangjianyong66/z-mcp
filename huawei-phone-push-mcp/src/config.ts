import { homedir } from "node:os";
import { resolve } from "node:path";
import { AppError } from "./types.js";

const DEFAULT_PUSH_URL = "https://hiboard-claw-drcn.ai.dbankcloud.cn/distribution/message/cloud/claw/msg/upload";

export type HuaweiPushConfig = {
  authCode: string;
  pushUrl: string;
  timeoutSec: number;
  saveRecords: boolean;
  recordsLimit: number;
  recordsDir: string;
  recordsFile: string;
};

function readRequiredString(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AppError("config_error", `${name} is required`);
  }
  return value;
}

function readString(name: string, defaultValue: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : defaultValue;
}

function readInt(name: string, defaultValue: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return defaultValue;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new AppError("config_error", `${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function readBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return defaultValue;
  }
  const normalized = raw.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new AppError("config_error", `${name} must be a boolean (true/false)`);
}

export function loadConfig(): HuaweiPushConfig {
  const recordsDirDefault = resolve(homedir(), ".huawei-phone-push-mcp");
  return {
    authCode: readRequiredString("HUAWEI_PUSH_AUTH_CODE"),
    pushUrl: readString("HUAWEI_PUSH_URL", DEFAULT_PUSH_URL),
    timeoutSec: readInt("HUAWEI_PUSH_TIMEOUT_SEC", 15, 1, 120),
    saveRecords: readBool("HUAWEI_PUSH_SAVE_RECORDS", true),
    recordsLimit: readInt("HUAWEI_PUSH_RECORDS_LIMIT", 100, 1, 5000),
    recordsDir: readString("HUAWEI_PUSH_RECORDS_DIR", recordsDirDefault),
    recordsFile: readString("HUAWEI_PUSH_RECORDS_FILE", "push-records.json")
  };
}
