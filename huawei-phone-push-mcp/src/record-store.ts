import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AppError, type PushRecord } from "./types.js";

export type RecordStoreConfig = {
  enabled: boolean;
  limit: number;
  dir: string;
  file: string;
};

export class RecordStore {
  constructor(private readonly config: RecordStoreConfig) {}

  async save(record: PushRecord): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const records = await this.readAll();
    records.push(record);
    const trimmed = records.slice(-this.config.limit);
    await this.writeAll(trimmed);
  }

  async list(page: number, pageSize: number): Promise<{ total: number; page: number; pageSize: number; items: PushRecord[] }> {
    const records = (await this.readAll()).slice().reverse();
    const total = records.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      total,
      page,
      pageSize,
      items: records.slice(start, end)
    };
  }

  private path(): string {
    return join(this.config.dir, this.config.file);
  }

  private async readAll(): Promise<PushRecord[]> {
    if (!this.config.enabled) {
      return [];
    }

    const path = this.path();
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error("record file is not a JSON array");
      }
      return parsed as PushRecord[];
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new AppError("io_error", `failed to read record file: ${message}`);
    }
  }

  private async writeAll(records: PushRecord[]): Promise<void> {
    const path = this.path();
    try {
      await mkdir(this.config.dir, { recursive: true });
      await writeFile(path, JSON.stringify(records, null, 2), "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AppError("io_error", `failed to write record file: ${message}`);
    }
  }
}
