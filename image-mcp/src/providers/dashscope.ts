import type {
  DashScopeResponse,
  GeneratedImage,
  GenerationResult,
  ImageEditInput,
  ImageGenerationInput,
  ImageProviderConfig,
  ProviderExecutionError,
  ResolvedImage
} from "../types.js";

const GENERATION_PATH = "/api/v1/services/aigc/multimodal-generation/generation";

function createRetryableError(status: string, message: string): ProviderExecutionError {
  return {
    retryable: true,
    status,
    message
  };
}

function parseGeneratedImages(payload: DashScopeResponse): GeneratedImage[] {
  const images =
    payload.output?.choices
      ?.flatMap((choice) => choice.message?.content ?? [])
      .map((item) => item.image?.trim())
      .filter((item): item is string => Boolean(item)) ?? [];

  return images.map((url) => ({ url }));
}

function extractRevisedPrompt(payload: DashScopeResponse): string | undefined {
  return payload.output?.choices
    ?.flatMap((choice) => choice.message?.content ?? [])
    .map((item) => item.text?.trim())
    .find((text): text is string => Boolean(text));
}

function formatResponse(
  config: ImageProviderConfig,
  prompt: string,
  payload: DashScopeResponse,
  results: GeneratedImage[]
): Omit<GenerationResult, "attempts"> {
  const revisedPrompt = extractRevisedPrompt(payload);

  return {
    model: config.model,
    provider: config.provider,
    prompt,
    ...(revisedPrompt ? { revisedPrompt } : {}),
    ...(payload.request_id ? { requestId: payload.request_id } : {}),
    results
  };
}

async function postToDashScope(
  config: ImageProviderConfig,
  body: Record<string, unknown>,
  action: string
): Promise<DashScopeResponse> {
  let response: Response;

  try {
    response = await fetch(`${config.baseURL}${GENERATION_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw createRetryableError("timeout", `DashScope ${action} request timed out: ${error.message}`);
    }

    const message = error instanceof Error ? error.message : String(error);
    throw createRetryableError("network_error", `DashScope ${action} request failed: ${message}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw createRetryableError(`http_${response.status}`, `DashScope ${action} request failed: ${response.status} ${errorText}`);
  }

  return (await response.json()) as DashScopeResponse;
}

function buildParameters(input: ImageGenerationInput): Record<string, unknown> {
  return {
    ...(input.size ? { size: input.size } : {}),
    ...(typeof input.n === "number" ? { n: input.n } : {}),
    ...(input.negative_prompt ? { negative_prompt: input.negative_prompt } : {}),
    ...(typeof input.watermark === "boolean" ? { watermark: input.watermark } : {})
  };
}

export async function generateWithDashScope(
  config: ImageProviderConfig,
  input: ImageGenerationInput
): Promise<Omit<GenerationResult, "attempts">> {
  const payload = await postToDashScope(
    config,
    {
      model: config.model,
      input: {
        messages: [
          {
            role: "user",
            content: [{ text: input.prompt }]
          }
        ]
      },
      parameters: buildParameters(input)
    },
    "image generation"
  );

  const results = parseGeneratedImages(payload);
  if (results.length === 0) {
    throw createRetryableError("empty_result", "DashScope image generation succeeded but returned no image URLs.");
  }

  return formatResponse(config, input.prompt, payload, results);
}

export async function editWithDashScope(
  config: ImageProviderConfig,
  input: ImageEditInput,
  resolvedImages: ResolvedImage[]
): Promise<Omit<GenerationResult, "attempts">> {
  const payload = await postToDashScope(
    config,
    {
      model: config.model,
      input: {
        messages: [
          {
            role: "user",
            content: [...resolvedImages.map((image) => ({ image: image.image })), { text: input.prompt }]
          }
        ]
      },
      parameters: buildParameters(input)
    },
    "image edit"
  );

  const results = parseGeneratedImages(payload);
  if (results.length === 0) {
    throw createRetryableError("empty_result", "DashScope image edit succeeded but returned no image URLs.");
  }

  return formatResponse(config, input.prompt, payload, results);
}
