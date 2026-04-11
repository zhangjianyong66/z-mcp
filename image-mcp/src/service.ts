import { resolveProviderChain } from "./config.js";
import { executeWithFallback } from "./executor.js";
import { resolveImageInput } from "./image-input.js";
import { editWithDashScope, generateWithDashScope } from "./providers/dashscope.js";
import type { GenerationResult, ImageEditInput, ImageGenerationInput, ImageProviderConfig } from "./types.js";

function assertDashScope(config: ImageProviderConfig): ImageProviderConfig {
  if (config.provider !== "dashscope") {
    throw new Error(`Unsupported image provider: ${config.provider}`);
  }

  return config;
}

export async function generateImage(input: ImageGenerationInput): Promise<GenerationResult> {
  const chain = resolveProviderChain();
  return executeWithFallback({
    chain,
    input,
    executor: async ({ config, input: request }) => generateWithDashScope(assertDashScope(config), request)
  });
}

export async function editImage(input: ImageEditInput): Promise<GenerationResult> {
  const resolvedImages = await Promise.all(input.images.map((image) => resolveImageInput(image)));
  const chain = resolveProviderChain();

  return executeWithFallback({
    chain,
    input,
    executor: async ({ config, input: request }) => editWithDashScope(assertDashScope(config), request, resolvedImages)
  });
}
