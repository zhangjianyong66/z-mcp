export type MinimaxConfig = {
  apiKey: string;
  baseURL: string;
  musicModel?: string;
  lyricsModel?: string;
  outputDir: string;
  pollIntervalMs: number;
  pollTimeoutMs: number;
};

export type LyricsInput = {
  prompt: string;
  model?: string;
  language?: string;
};

export type MusicInput = {
  prompt?: string;
  lyrics?: string;
  model?: string;
  audio_setting?: Record<string, unknown>;
  output_format?: string;
  voice_id?: string;
  instrumentation?: string;
  style?: string;
  genre?: string;
  custom?: Record<string, unknown>;
  save_to_file?: boolean;
  wait_for_result?: boolean;
};

export type CoverInput = {
  source_audio?: string;
  source_audio_path?: string;
  source_audio_url?: string;
  voice_id?: string;
  model?: string;
  save_to_file?: boolean;
  custom?: Record<string, unknown>;
  wait_for_result?: boolean;
};

export type SongFromPromptInput = {
  prompt: string;
  lyrics_model?: string;
  music_model?: string;
  language?: string;
  music_options?: Omit<MusicInput, "model" | "lyrics" | "save_to_file">;
  save_to_file?: boolean;
};

export type LyricsResult = {
  provider: "minimax";
  model?: string;
  status: string;
  lyrics: string;
  raw_response: unknown;
};

export type MusicResult = {
  provider: "minimax";
  model?: string;
  status: string;
  task_id?: string;
  audio_file_path?: string[];
  audio_url?: string[];
  output_format?: string;
  raw_response: unknown;
};

export type SongResult = {
  provider: "minimax";
  status: string;
  lyrics: LyricsResult;
  music: MusicResult;
  lyrics_file_path?: string;
};

export class MinimaxApiError extends Error {
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly payload?: unknown;

  constructor(message: string, statusCode: number, retryable: boolean, payload?: unknown) {
    super(message);
    this.name = "MinimaxApiError";
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.payload = payload;
  }
}
