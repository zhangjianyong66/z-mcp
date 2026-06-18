import { resolveVisionProviderChain } from "./config.js";
import { executeWithFallback } from "./executor.js";
import { resolveImageInput } from "./image-input.js";
import { analyzeWithDashScope } from "./providers/dashscope.js";
import type { ImageProviderConfig, VisionAnalysisInput, VisionAnalysisResult } from "./types.js";

function assertDashScope(config: ImageProviderConfig): ImageProviderConfig {
  if (config.provider !== "dashscope") {
    throw new Error(`Unsupported image view provider: ${config.provider}`);
  }

  return config;
}

export async function analyzeImage(input: VisionAnalysisInput): Promise<VisionAnalysisResult> {
  const resolvedImages = await Promise.all(input.images.map((image) => resolveImageInput(image)));
  const chain = resolveVisionProviderChain();

  return executeWithFallback({
    chain,
    input,
    executor: async ({ config, input: request }) => analyzeWithDashScope(assertDashScope(config), request, resolvedImages)
  });
}
