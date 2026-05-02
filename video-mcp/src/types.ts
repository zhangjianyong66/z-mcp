export const DEFAULT_DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com";
export const DEFAULT_MODEL = "wan2.2-kf2v-flash";

export type CommonVideoInput = {
  prompt?: string;
  model?: string;
  resolution?: "480P" | "720P" | "1080P";
  duration?: number;
  prompt_extend?: boolean;
  watermark?: boolean;
  poll_interval_ms?: number;
  timeout_ms?: number;
  save_to_local?: boolean;
  output_filename?: string;
};

export type GenerateVideoFromFramesInput = CommonVideoInput & {
  first_frame_url: string;
  last_frame_url: string;
};

export type GenerateVideoFromFirstFrameInput = CommonVideoInput & {
  first_frame_url: string;
};

export type ApiVariant = "legacy_kf2v" | "modern_i2v";

export type VideoTaskResult = {
  provider: "dashscope";
  model: string;
  api_variant: ApiVariant;
  task_id: string;
  task_status: string;
  video_url?: string;
  request_id?: string;
  input_assets?: {
    first_frame: string;
    last_frame?: string;
  };
  local_file_path?: string;
  local_file_size_bytes?: number;
  local_file_sha256?: string;
  raw?: unknown;
};

export type VideoProviderConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
  outputDir: string;
};

export type DashScopeTaskOutput = {
  task_id?: string;
  task_status?: string;
  video_url?: string;
};

export type DashScopeTaskResponse = {
  request_id?: string;
  output?: DashScopeTaskOutput;
  code?: string;
  message?: string;
};
