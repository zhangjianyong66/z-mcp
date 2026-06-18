## Purpose

`image-view-mcp` provides a standalone MCP server for read-only visual understanding of images through configured multimodal models.

## Requirements

### Requirement: Standalone image-view MCP server

The system SHALL provide a standalone `image-view-mcp` MCP server dedicated to read-only visual understanding.

#### Scenario: Server exposes visual analysis tool

- **WHEN** a client lists tools from `image-view-mcp`
- **THEN** the server exposes `analyze_image`
- **THEN** the server does not expose image generation or image editing tools

### Requirement: Image analysis input support

The system SHALL allow `analyze_image` to accept a natural language prompt and 1-3 images.

#### Scenario: Analyze local image

- **WHEN** a client calls `analyze_image` with one local image path and a prompt
- **THEN** the server sends the resolved image and prompt to the configured visual model
- **THEN** the server returns the model answer as text in a JSON result

#### Scenario: Analyze remote image URL

- **WHEN** a client calls `analyze_image` with an `http` or `https` image URL
- **THEN** the server accepts the URL when it resolves to an image response
- **THEN** the server includes the image in the model request

#### Scenario: Analyze data URL image

- **WHEN** a client calls `analyze_image` with a `data:image/...;base64` input
- **THEN** the server validates the data URL shape
- **THEN** the server includes the image in the model request

#### Scenario: Reject invalid image count

- **WHEN** a client calls `analyze_image` with zero images or more than three images
- **THEN** the server returns a tool error before calling the model provider

### Requirement: DashScope visual model configuration

The system SHALL configure visual model calls through environment variables.

#### Scenario: Single model configuration

- **WHEN** `VISION_MODEL` and a valid API key are configured
- **THEN** `analyze_image` uses that model for DashScope visual analysis requests

#### Scenario: Missing visual model configuration

- **WHEN** neither `VISION_MODEL` nor `VISION_MODEL_CHAIN` is configured
- **THEN** the server returns a clear configuration error before calling DashScope

#### Scenario: Configurable DashScope base URL

- **WHEN** `DASHSCOPE_BASE_URL` is configured
- **THEN** DashScope requests use that base URL after normalizing trailing slashes

### Requirement: Visual model fallback chain

The system SHALL support a visual model fallback chain for `analyze_image`.

#### Scenario: Fallback after provider failure

- **WHEN** the first configured visual model returns a retryable provider failure
- **THEN** the server tries the next configured visual model
- **THEN** the returned result includes attempts for both models

#### Scenario: All visual models fail

- **WHEN** all configured visual models fail
- **THEN** the server returns a tool error summarizing each attempted provider and status

### Requirement: Structured analysis result

The system SHALL return visual analysis results as JSON-formatted text.

#### Scenario: Successful analysis response

- **WHEN** DashScope returns a non-empty text answer
- **THEN** the tool response includes `provider`, `model`, `prompt`, `answer`, and `attempts`
- **THEN** the response includes `requestId` when the provider returns one

#### Scenario: Empty provider answer

- **WHEN** DashScope returns success without a text answer
- **THEN** the server treats the response as a retryable `empty_result` failure

### Requirement: Module documentation and client setup

The system SHALL document how to install, run, configure, and call `image-view-mcp`.

#### Scenario: User follows README setup

- **WHEN** a user opens the `image-view-mcp` README
- **THEN** the README documents required environment variables, local commands, MCP client configuration, and a minimal `analyze_image` call example

#### Scenario: Repository overview includes module

- **WHEN** a user opens the repository README
- **THEN** `image-view-mcp` appears in the module overview and environment variable summary
