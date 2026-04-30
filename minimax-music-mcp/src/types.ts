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
  song_title?: string;
  model?: string;
  audio_setting?: Record<string, unknown>;
  output_format?: string;
  lyrics_optimizer?: boolean;
  is_instrumental?: boolean;
  voice_id?: string;
  instrumentation?: string;
  style?: string;
  genre?: string;
  custom?: Record<string, unknown>;
  save_to_file?: boolean;
};

export type CoverInput = {
  source_audio?: string;
  source_audio_path?: string;
  source_audio_url?: string;
  voice_id?: string;
  model?: string;
  save_to_file?: boolean;
  custom?: Record<string, unknown>;
};

export type SongFromPromptInput = {
  prompt: string;
  output_format?: string;
  audio_setting?: Record<string, unknown>;
  with_lyrics?: boolean;
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
  music: MusicResult;
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
