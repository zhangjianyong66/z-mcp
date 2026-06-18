## Why

现有 `image-mcp` 同时承担生图、图生图和图片理解，视觉理解能力与生成类能力混在同一模块中，模型配置和工具语义容易相互干扰。新增独立 `image-view-mcp` 可以把图片识别、截图理解、多图对比等只读视觉能力单独演进，并支持 `qwen3.7-plus` 这类多模态模型。

## What Changes

- 新增 `image-view-mcp/` 模块，专门提供视觉理解 MCP server。
- 提供 `analyze_image` 工具，支持公网 URL、本地图片路径和 `data:image/...;base64` 输入。
- 使用 DashScope 百炼多模态同步接口调用视觉模型，默认面向 `qwen3.7-plus` 这类支持图片输入的模型。
- 支持单模型配置和多模型回退链，避免单个模型或账号失败时整个工具不可用。
- 提供 README、环境变量示例、MCP 客户端配置示例、类型检查和测试脚本。
- 保留现有 `image-mcp` 不做破坏性改动；是否后续移除其中的 `analyze_image` 另行决策。

## Capabilities

### New Capabilities

- `image-view-mcp`: 独立 MCP 模块，提供基于多模态模型的图片视觉理解工具。

### Modified Capabilities

- 无。

## Impact

- 新增模块目录：`image-view-mcp/`。
- 更新仓库级文档和协作说明：`README.md`、`AGENTS.md`。
- 可选更新 `mcp-cli` 预设，使其支持 inspect/list-tools/call-tool 调试 `image-view`。
- 依赖 DashScope API Key 和支持图片输入的视觉模型；不引入数据库或浏览器运行时依赖。
