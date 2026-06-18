## 1. Module Setup

- [x] 1.1 Create `image-view-mcp/` with TypeScript ESM package metadata, `tsconfig.json`, `.env.example`, source and test folders.
- [x] 1.2 Add MCP server entrypoint exposing only `analyze_image` and matching the repository's existing stdio server pattern.

## 2. Core Visual Analysis

- [x] 2.1 Implement environment configuration for `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL`, `VISION_MODEL`, and `VISION_MODEL_CHAIN`.
- [x] 2.2 Implement image input resolution for local paths, remote URLs, and `data:image/...;base64` values.
- [x] 2.3 Implement DashScope visual analysis request/response handling using the multimodal generation endpoint.
- [x] 2.4 Implement retry/fallback attempts and aggregated error reporting for visual model chains.

## 3. Tests and Documentation

- [x] 3.1 Add unit tests for config resolution, image input validation, request body construction, response parsing, and fallback behavior.
- [x] 3.2 Add `image-view-mcp` README plus repository README, AGENTS, and optional `mcp-cli` preset updates.

## 4. Verification

- [x] 4.1 Run `npm run check`, `npm test`, and `npm run build` in `image-view-mcp`.
- [x] 4.2 Verify the OpenSpec change status and record any follow-up gaps before implementation is considered complete.
