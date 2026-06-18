## Context

仓库已经有 `image-mcp`，它基于 DashScope 百炼多模态同步接口提供生图、参考图生成和 `analyze_image`。视觉理解与生成能力共享一个模块后，工具命名、模型配置和 README 说明逐渐混杂；未来如果继续扩展 OCR、截图理解、多图对比，会让 `image-mcp` 的职责更不清楚。

`image-view-mcp` 作为新模块，只提供只读视觉理解能力。它优先复用 `image-mcp` 已验证过的 Node.js ESM + TypeScript + MCP SDK 结构、图片输入解析、DashScope 调用格式和回退执行器，但在对外文档和环境变量上围绕视觉模型重新命名。

## Goals / Non-Goals

**Goals:**

- 新增独立 MCP server `image-view-mcp`，首版提供 `analyze_image`。
- 支持 1-3 张图片输入，图片来源包括公网 URL、本地文件路径和 `data:image/...;base64`。
- 支持 DashScope 百炼多模态视觉模型，例如 `qwen3.7-plus`。
- 支持单模型配置和多模型回退链。
- 返回结构化 JSON 文本，包含 provider、model、prompt、answer、requestId 和 attempts。
- 提供模块 README、`.env.example`、测试、类型检查、构建脚本，并更新仓库 README / AGENTS / mcp-cli 预设。

**Non-Goals:**

- 不在首版实现生图或图生图；这些继续归属 `image-mcp`。
- 不在首版移除 `image-mcp` 的 `analyze_image`，避免破坏现有客户端配置。
- 不承诺专用 OCR schema、目标框坐标、区域标注或 UI 自动化判断。
- 不新增数据库、浏览器自动化或文件持久化下载能力。

## Decisions

### Decision: 新建模块而不是继续扩展 image-mcp

选择新增 `image-view-mcp/`，因为视觉理解是只读分析能力，和生图类工具在模型、错误预期、调用结果和用户心智上都不同。独立模块可以让客户端按需启用，也避免 `DASHSCOPE_MODEL` 与 `VISION_MODEL` 继续混用。

替代方案是在 `image-mcp` 内保留并增强 `analyze_image`。这个方案实现成本更低，但会让模块职责继续扩大，不利于后续添加 `compare_images`、`extract_text` 等视觉理解能力。

### Decision: 首版只暴露 analyze_image

`analyze_image` 覆盖图片描述、元素识别、截图理解、多图对比等通用视觉问答场景。首版保持一个高通用工具，可以减少 MCP tool 面过早膨胀。

替代方案是首版同时加入 `compare_images`、`extract_text`、`inspect_ui`。这些工具有价值，但它们需要更明确的输出契约和测试样例，适合作为后续增量需求。

### Decision: 复用 DashScope multimodal-generation 同步接口

当前 `image-mcp` 已经验证 `POST /api/v1/services/aigc/multimodal-generation/generation` 可以按图片内容加文本提示词的形式调用。`image-view-mcp` 首版沿用该接口，降低实现风险。

替代方案是改用 OpenAI 兼容 Chat Completions 风格接口。这个方案可能更接近部分模型的新推荐用法，但会引入新的请求/响应适配和兼容性判断，首版不采用。

### Decision: 环境变量以 VIEW/VISION 语义命名

模块配置使用 `DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL`、`VISION_MODEL` 和 `VISION_MODEL_CHAIN`。`VISION_MODEL` 必填，避免误用生图模型默认值。`VISION_MODEL_CHAIN` 支持内联 JSON 或 `file:` 路径。

替代方案是沿用 `DASHSCOPE_MODEL`。这会降低迁移成本，但容易把生图模型和视觉理解模型混在一起。

### Decision: 从 image-mcp 复制共享代码，不先抽公共包

首版可以复制少量成熟代码，包括图片输入解析、DashScope provider、回退执行器和测试模式。仓库当前是多模块独立维护，尚未形成共享包约定；为了降低耦合，先不抽 `packages/common`。

替代方案是立即抽公共库。这个方案减少重复，但会牵动现有模块构建、依赖和发布方式，超出本次变更范围。

## Risks / Trade-offs

- 模型名或地域端点配置错误 -> README 和 `.env.example` 明确 `VISION_MODEL` 必须是支持图片输入的百炼多模态模型，并保留 `DASHSCOPE_BASE_URL` 可配置。
- 复制代码导致后续修复需要同步两处 -> 任务中要求测试覆盖图片输入解析、请求体构造和回退逻辑；后续若重复增多再考虑公共包。
- 远程 URL 下载可能遇到非图片响应或大文件 -> 首版只接受 `image/*` 内容类型或可识别的本地图片扩展名，并在错误中明确原因。
- 回退链可能掩盖主模型故障 -> 返回 `attempts`，让调用方看到每个模型尝试状态。
- `qwen3.7-plus` 等模型能力随百炼平台变化 -> 不把模型能力写死到代码，全部通过配置注入。

## Migration Plan

1. 新增 `image-view-mcp` 并完成本地测试。
2. 更新根 README、AGENTS 和 mcp-cli 预设，便于调试和后续使用。
3. 客户端可新增 `image-view` MCP server 配置并逐步把图片理解调用迁移过去。
4. 保留 `image-mcp` 的现有 `analyze_image`，本次不做移除；如果后续确认无人使用，再单独提出 deprecate/remove 变更。

## Open Questions

- 是否需要在后续版本增加专用 `extract_text` 工具，并定义结构化 OCR 输出？
- 是否需要支持 OpenAI 兼容接口作为 DashScope 之外的 provider？
- 是否需要限制远程图片下载大小和超时时间为可配置项？
