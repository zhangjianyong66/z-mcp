import type {
  DashScopeResponse,
  ImageProviderConfig,
  ProviderExecutionError,
  ResolvedImage,
  VisionAnalysisInput,
  VisionAnalysisResult
} from "../types.js";

const GENERATION_PATH = "/api/v1/services/aigc/multimodal-generation/generation";

function createRetryableError(status: string, message: string): ProviderExecutionError {
  return {
    retryable: true,
    status,
    message
  };
}

function extractTextAnswer(payload: DashScopeResponse): string | undefined {
  const parts =
    payload.output?.choices
      ?.flatMap((choice) => choice.message?.content ?? [])
      .map((item) => item.text?.trim())
      .filter((text): text is string => Boolean(text)) ?? [];

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join("\n\n");
}

function formatVisionResponse(
  config: ImageProviderConfig,
  prompt: string,
  payload: DashScopeResponse,
  answer: string
): Omit<VisionAnalysisResult, "attempts"> {
  return {
    model: config.model,
    provider: config.provider,
    prompt,
    answer,
    ...(payload.request_id ? { requestId: payload.request_id } : {})
  };
}

async function postToDashScope(config: ImageProviderConfig, body: Record<string, unknown>): Promise<DashScopeResponse> {
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
    const message = error instanceof Error ? error.message : String(error);
    throw createRetryableError("network_error", `DashScope image analysis request failed: ${message}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw createRetryableError("http_" + response.status, `DashScope image analysis request failed: ${response.status} ${errorText}`);
  }

  return (await response.json()) as DashScopeResponse;
}

export function buildAnalyzeRequestBody(
  config: ImageProviderConfig,
  input: VisionAnalysisInput,
  resolvedImages: ResolvedImage[]
) {
  return {
    model: config.model,
    input: {
      messages: [
        {
          role: "user",
          content: [...resolvedImages.map((image) => ({ image: image.image })), { text: input.prompt }]
        }
      ]
    }
  };
}

export async function analyzeWithDashScope(
  config: ImageProviderConfig,
  input: VisionAnalysisInput,
  resolvedImages: ResolvedImage[]
): Promise<Omit<VisionAnalysisResult, "attempts">> {
  const payload = await postToDashScope(config, buildAnalyzeRequestBody(config, input, resolvedImages));
  const answer = extractTextAnswer(payload);
  if (!answer) {
    throw createRetryableError("empty_result", "DashScope image analysis succeeded but returned no text answer.");
  }

  return formatVisionResponse(config, input.prompt, payload, answer);
}
