export const DEFAULT_DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com";
export const DEFAULT_MODEL = "qwen-image-2.0-pro";

export type ImageProvider = "dashscope";

export type GeneratedImage = {
  url: string;
};

export type ProviderAttempt = {
  provider: ImageProvider;
  model: string;
  status: string;
};

export type ImageProviderConfig = {
  provider: ImageProvider;
  model: string;
  apiKey: string;
  baseURL: string;
};

export type GenerationResult = {
  model: string;
  provider: ImageProvider;
  prompt: string;
  revisedPrompt?: string;
  requestId?: string;
  results: GeneratedImage[];
  attempts: ProviderAttempt[];
};

export type VisionAnalysisResult = {
  model: string;
  provider: ImageProvider;
  prompt: string;
  answer: string;
  requestId?: string;
  attempts: ProviderAttempt[];
};

export type ProviderExecutionError = {
  retryable: boolean;
  status: string;
  message: string;
};

export type ProviderExecutionContext<TInput> = {
  config: ImageProviderConfig;
  input: TInput;
  attempts: ProviderAttempt[];
};

export type ProviderExecutor<TInput, TResult extends { provider: ImageProvider; model: string }> = (
  context: ProviderExecutionContext<TInput>
) => Promise<TResult>;

export type ImageGenerationInput = {
  prompt: string;
  size?: string;
  n?: number;
  negative_prompt?: string;
  watermark?: boolean;
};

export type ImageEditInput = ImageGenerationInput & {
  images: string[];
};

export type VisionAnalysisInput = {
  prompt: string;
  images: string[];
};

export type ResolvedImage = {
  image: string;
};

export type DashScopeResponse = {
  request_id?: string;
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{
          image?: string;
          text?: string;
        }>;
      };
    }>;
  };
};
