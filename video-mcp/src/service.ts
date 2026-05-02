import { basename, extname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { resolveVideoConfig } from "./config.js";
import type {
  ApiVariant,
  CommonVideoInput,
  DashScopeTaskResponse,
  GenerateVideoFromFirstFrameInput,
  GenerateVideoFromFramesInput,
  VideoTaskResult
} from "./types.js";

const LEGACY_CREATE_TASK_PATH = "/api/v1/services/aigc/image2video/video-synthesis";
const MODERN_CREATE_TASK_PATH = "/api/v1/services/aigc/video-generation/video-synthesis";
const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 180_000;

const LEGACY_MODEL_PATTERN = /kf2v/i;
const MODERN_MODEL_PATTERN = /(wan2\.7|happyhorse).*(i2v)|i2v/i;

function toInteger(value: number | undefined, defaultValue: number, min: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return defaultValue;
  }
  return Math.max(min, Math.floor(value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferMimeType(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    default:
      return "application/octet-stream";
  }
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatNowCompact(): string {
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}_${hh}${mm}${ss}`;
}

function ensureMp4Extension(fileName: string): string {
  if (fileName.toLowerCase().endsWith(".mp4")) {
    return fileName;
  }
  return `${fileName}.mp4`;
}

async function downloadVideoToLocal(options: {
  videoUrl: string;
  outputDir: string;
  model: string;
  taskId: string;
  outputFilename?: string;
}): Promise<{ local_file_path: string; local_file_size_bytes: number; local_file_sha256: string }> {
  const response = await fetch(options.videoUrl);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Download video failed: HTTP ${response.status} ${message}`.trim());
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  await mkdir(options.outputDir, { recursive: true });

  const defaultName = `${sanitizeFileName(options.model)}_${sanitizeFileName(options.taskId)}_${formatNowCompact()}.mp4`;
  const preferred = options.outputFilename ? ensureMp4Extension(sanitizeFileName(options.outputFilename)) : defaultName;
  const baseName = preferred.replace(/\.mp4$/i, "");
  let candidate = resolve(options.outputDir, preferred);
  let index = 1;

  while (true) {
    try {
      await stat(candidate);
      candidate = resolve(options.outputDir, `${baseName}_${index}.mp4`);
      index += 1;
    } catch {
      break;
    }
  }

  const tmpPath = `${candidate}.tmp`;
  await writeFile(tmpPath, bytes);
  await rename(tmpPath, candidate);
  const fileStat = await stat(candidate);

  return {
    local_file_path: candidate,
    local_file_size_bytes: fileStat.size,
    local_file_sha256: sha256
  };
}

function parseDataUrl(value: string): { mimeType: string; bytes: Uint8Array; fileName: string } {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) {
    throw new Error("Invalid data URL format. Expected data:{mime};base64,{data}");
  }

  const mimeType = match[1] ?? "application/octet-stream";
  const payload = match[2] ?? "";
  const bytes = Uint8Array.from(Buffer.from(payload, "base64"));
  const ext = mimeType.split("/")[1] ?? "bin";
  return {
    mimeType,
    bytes,
    fileName: `upload.${ext}`
  };
}

export function resolveApiVariant(model: string): ApiVariant {
  if (LEGACY_MODEL_PATTERN.test(model)) {
    return "legacy_kf2v";
  }

  if (MODERN_MODEL_PATTERN.test(model)) {
    return "modern_i2v";
  }

  throw new Error(`Unsupported model for video generation: ${model}. Use kf2v models for legacy, or wan2.7/happyhorse i2v models.`);
}

async function parseResponseBody(response: Response): Promise<DashScopeTaskResponse> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as DashScopeTaskResponse;
  } catch {
    throw new Error(`DashScope returned non-JSON response: ${text}`);
  }
}

type UploadPolicy = {
  uploadHost: string;
  uploadDir: string;
  policy: string;
  signature: string;
  ossAccessKeyId?: string;
  xOssObjectAcl?: string;
  xOssForbidOverwrite?: string;
};

function toUploadPolicy(raw: unknown): UploadPolicy {
  const record = (raw ?? {}) as Record<string, unknown>;
  const data = (record.data ?? record.output ?? record) as Record<string, unknown>;

  const uploadHost = String(data.upload_host ?? data.host ?? "").trim();
  const uploadDir = String(data.upload_dir ?? data.dir ?? "").trim();
  const policy = String(data.policy ?? "").trim();
  const signature = String(data.signature ?? "").trim();

  if (!uploadHost || !uploadDir || !policy || !signature) {
    throw new Error("DashScope upload policy response missing required fields.");
  }

  return {
    uploadHost,
    uploadDir,
    policy,
    signature,
    ossAccessKeyId: typeof data.oss_access_key_id === "string" ? data.oss_access_key_id : undefined,
    xOssObjectAcl: typeof data.x_oss_object_acl === "string" ? data.x_oss_object_acl : undefined,
    xOssForbidOverwrite: typeof data.x_oss_forbid_overwrite === "string" ? data.x_oss_forbid_overwrite : undefined
  };
}

async function getUploadPolicy(config: { apiKey: string; baseURL: string }, model: string): Promise<UploadPolicy> {
  const url = new URL(`${config.baseURL}/api/v1/uploads`);
  url.searchParams.set("action", "getPolicy");
  url.searchParams.set("model", model);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`
    }
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(`DashScope get upload policy failed: HTTP ${response.status} ${payload.message ?? ""}`.trim());
  }

  return toUploadPolicy(payload);
}

async function uploadBinaryAsOssUrl(
  config: { apiKey: string; baseURL: string },
  model: string,
  asset: { mimeType: string; bytes: Uint8Array; fileName: string }
): Promise<string> {
  const policy = await getUploadPolicy(config, model);
  const normalizedName = sanitizeFileName(asset.fileName);
  const key = `${policy.uploadDir.replace(/\/+$/, "")}/${Date.now()}-${normalizedName}`;

  const form = new FormData();
  form.append("key", key);
  form.append("policy", policy.policy);
  form.append("signature", policy.signature);
  form.append("success_action_status", "200");

  if (policy.ossAccessKeyId) {
    form.append("OSSAccessKeyId", policy.ossAccessKeyId);
  }

  if (policy.xOssObjectAcl) {
    form.append("x-oss-object-acl", policy.xOssObjectAcl);
  }

  if (policy.xOssForbidOverwrite) {
    form.append("x-oss-forbid-overwrite", policy.xOssForbidOverwrite);
  }

  const blob = new Blob([Buffer.from(asset.bytes)], { type: asset.mimeType });
  form.append("file", blob, normalizedName);

  const uploadResponse = await fetch(policy.uploadHost, {
    method: "POST",
    body: form
  });

  if (!uploadResponse.ok) {
    const uploadError = await uploadResponse.text();
    throw new Error(`DashScope upload file failed: HTTP ${uploadResponse.status} ${uploadError}`);
  }

  return `oss://${key}`;
}

async function resolveInputAssetToUrl(
  config: { apiKey: string; baseURL: string },
  model: string,
  rawValue: string
): Promise<string> {
  const value = rawValue.trim();

  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("oss://")) {
    return value;
  }

  if (value.startsWith("file://")) {
    const filePath = value.replace(/^file:\/\//, "");
    const bytes = Uint8Array.from(await readFile(filePath));
    const fileName = basename(filePath) || "upload.bin";
    const mimeType = inferMimeType(fileName);
    return uploadBinaryAsOssUrl(config, model, { mimeType, bytes, fileName });
  }

  if (value.startsWith("data:")) {
    const parsed = parseDataUrl(value);
    return uploadBinaryAsOssUrl(config, model, parsed);
  }

  throw new Error("Unsupported frame input. Use http(s) URL, oss:// URL, file:// path, or data:image base64.");
}

function buildModernParameters(input: CommonVideoInput): Record<string, unknown> {
  const duration = toInteger(input.duration, 5, 2);
  if (duration > 15) {
    throw new Error("Modern i2v models only support duration between 2 and 15 seconds.");
  }

  return {
    resolution: input.resolution ?? "720P",
    duration,
    prompt_extend: input.prompt_extend ?? true,
    watermark: input.watermark ?? true
  };
}

function buildModernMedia(firstFrameUrl: string, lastFrameUrl?: string): Array<{ type: string; url: string }> {
  const media = [{ type: "first_frame", url: firstFrameUrl }];
  if (lastFrameUrl) {
    media.push({ type: "last_frame", url: lastFrameUrl });
  }
  return media;
}

async function createLegacyTask(
  config: { apiKey: string; baseURL: string; model: string },
  input: GenerateVideoFromFramesInput,
  resolved: { firstFrameUrl: string; lastFrameUrl: string }
): Promise<DashScopeTaskResponse> {
  if (typeof input.duration === "number" && input.duration !== 5) {
    throw new Error("Legacy kf2v models only support fixed duration=5.");
  }

  const response = await fetch(`${config.baseURL}${LEGACY_CREATE_TASK_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "X-DashScope-Async": "enable",
      "X-DashScope-OssResourceResolve": "enable"
    },
    body: JSON.stringify({
      model: input.model ?? config.model,
      input: {
        first_frame_url: resolved.firstFrameUrl,
        last_frame_url: resolved.lastFrameUrl,
        ...(input.prompt ? { prompt: input.prompt } : {})
      },
      parameters: {
        resolution: input.resolution ?? "720P",
        prompt_extend: input.prompt_extend ?? true,
        watermark: input.watermark ?? true
      }
    })
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(`DashScope create task failed: HTTP ${response.status} ${payload.message ?? ""}`.trim());
  }
  return payload;
}

async function createModernTask(
  config: { apiKey: string; baseURL: string; model: string },
  input: CommonVideoInput,
  resolved: { firstFrameUrl: string; lastFrameUrl?: string }
): Promise<DashScopeTaskResponse> {
  const response = await fetch(`${config.baseURL}${MODERN_CREATE_TASK_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "X-DashScope-Async": "enable",
      "X-DashScope-OssResourceResolve": "enable"
    },
    body: JSON.stringify({
      model: input.model ?? config.model,
      input: {
        ...(input.prompt ? { prompt: input.prompt } : {}),
        media: buildModernMedia(resolved.firstFrameUrl, resolved.lastFrameUrl)
      },
      parameters: buildModernParameters(input)
    })
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(`DashScope create task failed: HTTP ${response.status} ${payload.message ?? ""}`.trim());
  }
  return payload;
}

async function getTask(config: { apiKey: string; baseURL: string }, taskId: string): Promise<DashScopeTaskResponse> {
  const response = await fetch(`${config.baseURL}/api/v1/tasks/${taskId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`
    }
  });

  const payload = await parseResponseBody(response);
  if (!response.ok) {
    throw new Error(`DashScope get task failed: HTTP ${response.status} ${payload.message ?? ""}`.trim());
  }
  return payload;
}

async function waitTaskToComplete(
  config: { apiKey: string; baseURL: string; outputDir: string },
  model: string,
  apiVariant: ApiVariant,
  inputAssets: { first_frame: string; last_frame?: string },
  inputOptions: CommonVideoInput,
  createResult: DashScopeTaskResponse,
  timeoutMs: number,
  pollIntervalMs: number
): Promise<VideoTaskResult> {
  const taskId = createResult.output?.task_id;
  if (!taskId) {
    throw new Error("DashScope create task succeeded but task_id is missing.");
  }

  const startedAt = Date.now();
  let last = createResult;

  while (Date.now() - startedAt < timeoutMs) {
    const status = last.output?.task_status;
    if (status === "SUCCEEDED") {
      const videoUrl = last.output?.video_url;
      let localResult:
        | { local_file_path: string; local_file_size_bytes: number; local_file_sha256: string }
        | undefined;
      if (videoUrl && inputOptions.save_to_local !== false) {
        localResult = await downloadVideoToLocal({
          videoUrl,
          outputDir: config.outputDir,
          model,
          taskId,
          outputFilename: inputOptions.output_filename
        });
      }

      return {
        provider: "dashscope",
        model,
        api_variant: apiVariant,
        task_id: taskId,
        task_status: status,
        video_url: videoUrl,
        request_id: last.request_id,
        input_assets: inputAssets,
        ...(localResult ?? {}),
        raw: last
      };
    }

    if (status === "FAILED" || status === "CANCELED") {
      const message = last.message ?? "Task failed";
      throw new Error(`DashScope video task ${status}: ${message}`);
    }

    await sleep(pollIntervalMs);
    last = await getTask(config, taskId);
  }

  throw new Error(`DashScope video task timed out after ${timeoutMs}ms. task_id=${taskId}`);
}

export async function generateVideoFromFrames(input: GenerateVideoFromFramesInput): Promise<VideoTaskResult> {
  const config = resolveVideoConfig();
  const model = input.model ?? config.model;
  const apiVariant = resolveApiVariant(model);
  const pollIntervalMs = toInteger(input.poll_interval_ms, DEFAULT_POLL_INTERVAL_MS, 1_000);
  const timeoutMs = toInteger(input.timeout_ms, DEFAULT_TIMEOUT_MS, 10_000);

  const firstFrameUrl = await resolveInputAssetToUrl(config, model, input.first_frame_url);
  const lastFrameUrl = await resolveInputAssetToUrl(config, model, input.last_frame_url);

  const createResult =
    apiVariant === "legacy_kf2v"
      ? await createLegacyTask(config, input, { firstFrameUrl, lastFrameUrl })
      : await createModernTask(config, input, { firstFrameUrl, lastFrameUrl });

  return waitTaskToComplete(
    config,
    model,
    apiVariant,
    { first_frame: firstFrameUrl, last_frame: lastFrameUrl },
    input,
    createResult,
    timeoutMs,
    pollIntervalMs
  );
}

export async function generateVideoFromFirstFrame(input: GenerateVideoFromFirstFrameInput): Promise<VideoTaskResult> {
  const config = resolveVideoConfig();
  const model = input.model ?? config.model;
  const apiVariant = resolveApiVariant(model);
  if (apiVariant !== "modern_i2v") {
    throw new Error("generate_video_from_first_frame only supports wan2.7/happyhorse i2v models.");
  }

  const pollIntervalMs = toInteger(input.poll_interval_ms, DEFAULT_POLL_INTERVAL_MS, 1_000);
  const timeoutMs = toInteger(input.timeout_ms, DEFAULT_TIMEOUT_MS, 10_000);

  const firstFrameUrl = await resolveInputAssetToUrl(config, model, input.first_frame_url);
  const createResult = await createModernTask(config, input, { firstFrameUrl });

  return waitTaskToComplete(config, model, apiVariant, { first_frame: firstFrameUrl }, input, createResult, timeoutMs, pollIntervalMs);
}
