# z-mcp image server

一个个人使用的 MCP image server。当前提供纯文本生图、参考图生图和图片理解工具，基于阿里云百炼多模态同步接口。参考图生图想要稳定保留风格和主体特征时，必须提供详细提示词。

## 功能

- `generate_image`
  - 输入文本提示词生成图片
  - 支持可选参数：`size`、`n`、`negative_prompt`、`watermark`
  - 返回百炼生成的临时图片 URL 列表
- `edit_image`
  - 输入 `1-3` 张参考图和文本提示词，生成继承参考图风格的新图片
  - 参考图支持公网 URL、本地文件路径和 `data:image/...`
  - 多图时建议按顺序传入：图 1 负责风格，图 2 负责主体形象
  - 提示词必须明确写出每张图的职责、保留特征和排除项
  - 支持可选参数：`size`、`n`、`negative_prompt`、`watermark`
  - 返回百炼生成的临时图片 URL 列表
- `analyze_image`
  - 输入 `1-3` 张图片和一个自然语言问题/分析指令
  - 图片支持公网 URL、本地文件路径和 `data:image/...`
  - 适用于图片描述、元素识别、截图理解、双图对比等通用视觉问答场景
  - 返回自然语言分析结果

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
DASHSCOPE_API_KEY=your_api_key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com
DASHSCOPE_MODEL=qwen-image-2.0-pro
```

启用多模型自动回退时，优先使用 `IMAGE_MODEL_CHAIN`：

```bash
IMAGE_MODEL_CHAIN='[
  {
    "provider": "dashscope",
    "apiKey": "your_primary_key",
    "baseURL": "https://dashscope.aliyuncs.com",
    "model": "qwen-image-2.0-pro"
  },
  {
    "provider": "dashscope",
    "apiKey": "your_secondary_key",
    "baseURL": "https://dashscope.aliyuncs.com",
    "model": "wanx2.1-t2i-turbo"
  }
]'
```

如果你希望把回退链放到独立 JSON 文件，也可以使用 `file:` 前缀传路径：

```bash
IMAGE_MODEL_CHAIN=file:/absolute/path/to/image-chain.json
# 或相对路径（相对于进程工作目录）
IMAGE_MODEL_CHAIN=file:./configs/image-chain.json
```

图片理解工具使用独立视觉模型配置：

```bash
VISION_API_KEY=your_api_key
VISION_BASE_URL=https://dashscope.aliyuncs.com
VISION_MODEL=your_vision_model
```

如需为图片理解单独配置多模型回退链：

```bash
VISION_MODEL_CHAIN='[
  {
    "provider": "dashscope",
    "apiKey": "your_primary_key",
    "baseURL": "https://dashscope.aliyuncs.com",
    "model": "your_primary_vision_model"
  },
  {
    "provider": "dashscope",
    "apiKey": "your_secondary_key",
    "baseURL": "https://dashscope.aliyuncs.com",
    "model": "your_secondary_vision_model"
  }
]'
```

视觉回退链同样支持 JSON 文件路径：

```bash
VISION_MODEL_CHAIN=file:/absolute/path/to/vision-chain.json
# 或相对路径（相对于进程工作目录）
VISION_MODEL_CHAIN=file:./configs/vision-chain.json
```

说明：

- `IMAGE_MODEL_CHAIN` 存在时优先使用，按数组顺序尝试候选模型
- `VISION_MODEL_CHAIN` 存在时优先用于 `analyze_image`
- `IMAGE_MODEL_CHAIN` / `VISION_MODEL_CHAIN` 以 `file:` 开头时，会读取对应 JSON 文件内容
- 未使用 `file:` 前缀时，`IMAGE_MODEL_CHAIN` / `VISION_MODEL_CHAIN` 按内联 JSON 字符串解析
- `DASHSCOPE_API_KEY` 为首选鉴权变量
- `VISION_API_KEY` 用于图片理解；未设置时会回退到 `DASHSCOPE_API_KEY` / `LLM_API_KEY`
- `LLM_API_KEY` 和 `LLM_MODEL` 仍可作为兼容兜底
- `DASHSCOPE_BASE_URL` 默认值是 `https://dashscope.aliyuncs.com`
- `VISION_BASE_URL` 未配置时会回退到 `DASHSCOPE_BASE_URL` / `LLM_BASE_URL`
- `IMAGE_MODEL_CHAIN` 未配置时，服务会退回到单模型兼容模式
- `VISION_MODEL_CHAIN` 未配置时，`analyze_image` 会使用 `VISION_MODEL`
- 代码启动时会自动读取项目根目录下的 `.env`

## 接口说明

- 工具内部调用百炼同步接口 `POST /api/v1/services/aigc/multimodal-generation/generation`
- 当前实现：
  - `generate_image`：纯文本生图
  - `edit_image`：参考图风格迁移 / 图生图
  - `analyze_image`：通用图片理解 / 视觉问答
- 返回的图片 URL 为百炼临时地址，通常有时效，不会自动下载到本地
- `edit_image` 没有独立的风格权重或主体权重参数，效果主要依赖参考图顺序和详细提示词
- `edit_image` 更准确地说是“参考融合工具”，不是“风格图/主体图硬隔离工具”
- `analyze_image` 第一版返回自然语言分析结果，不提供目标框、区域坐标或严格 OCR 结构化 schema

## 自动回退规则

- 只要当前候选模型发生远端调用失败，就会自动尝试下一个候选
- 会触发回退的情况：
  - 网络错误
  - 请求超时
  - HTTP 非 2xx，例如 `429`、`500`
  - provider 返回成功响应但没有图片结果
- 不会触发回退的情况：
  - 输入参数不合法
  - 本地图片文件读取失败
  - `data:image/...` 格式错误
  - 本地文件不是图片

## 返回结果说明

成功结果除了原来的 `provider`、`model`、`prompt`、`results` 之外，还会返回 `attempts`：

```json
{
  "provider": "dashscope",
  "model": "wanx2.1-t2i-turbo",
  "prompt": "一只橘猫坐在木质窗台上，午后阳光，电影感摄影",
  "attempts": [
    {
      "provider": "dashscope",
      "model": "qwen-image-2.0-pro",
      "status": "http_500"
    },
    {
      "provider": "dashscope",
      "model": "wanx2.1-t2i-turbo",
      "status": "success"
    }
  ],
  "results": [
    {
      "url": "https://..."
    }
  ]
}
```

说明：

- `attempts` 按真实尝试顺序返回
- 成功时最后一项一定是 `success`
- 如果所有候选都失败，工具会返回聚合错误摘要，而不是只返回最后一次失败

`analyze_image` 成功结果示例：

```json
{
  "provider": "dashscope",
  "model": "your_vision_model",
  "prompt": "请比较两张图的主要差异。",
  "answer": "第一张图是室外街景，第二张图是室内办公场景。两张图在光线、主体和背景布局上明显不同。",
  "attempts": [
    {
      "provider": "dashscope",
      "model": "your_vision_model",
      "status": "success"
    }
  ]
}
```

## 如何正确使用 `edit_image`

优先原则：

- 如果你的目标是“保留一张图的画风，但换成一个全新主体”，优先使用单张风格图 + 详细主体描述
- 如果你的目标是“融合多个参考元素”，再使用多图
- 不要默认认为两张图可以像图层一样严格分工

更推荐的场景：

- 单图 + 详细文字描述：
  适合“保留猴子头像的画风，改成松鼠头像”这类任务
- 多图融合：
  适合“图1给场景/背景，图2给主体元素”或“多角度补充同一主体”

不太推荐的场景：

- 图1只控风格，图2只控主体，并要求两者严格不串味
- 第二张图本身已经带有很强的旧风格、贴纸感、3D感、重阴影，却又希望模型完全忽略这些内容

## 安装

```bash
npm install
```

## 开发

```bash
npm run dev
```

## 构建

```bash
npm run build
```

## MCP 配置示例

下面以本地 `node` 启动为例：

```json
{
  "mcpServers": {
    "image": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/image-mcp/dist/index.js"],
      "env": {
        "IMAGE_MODEL_CHAIN": "[{\"provider\":\"dashscope\",\"apiKey\":\"your_primary_key\",\"baseURL\":\"https://dashscope.aliyuncs.com\",\"model\":\"qwen-image-2.0-pro\"},{\"provider\":\"dashscope\",\"apiKey\":\"your_secondary_key\",\"baseURL\":\"https://dashscope.aliyuncs.com\",\"model\":\"wanx2.1-t2i-turbo\"}]"
      }
    }
  }
}
```

你也可以把模型链写入独立文件，再通过 `file:` 传入：

`image-chain.json` 示例：

```json
[
  {
    "provider": "dashscope",
    "apiKey": "your_primary_key",
    "baseURL": "https://dashscope.aliyuncs.com",
    "model": "qwen-image-2.0-pro"
  },
  {
    "provider": "dashscope",
    "apiKey": "your_secondary_key",
    "baseURL": "https://dashscope.aliyuncs.com",
    "model": "wanx2.1-t2i-turbo"
  }
]
```

MCP 配置：

```json
{
  "mcpServers": {
    "image": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/image-mcp/dist/index.js"],
      "env": {
        "IMAGE_MODEL_CHAIN": "file:/absolute/path/to/image-chain.json"
      }
    }
  }
}
```

如果你只需要单模型，也可以继续使用：

```json
{
  "mcpServers": {
    "image": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/image-mcp/dist/index.js"],
      "env": {
        "DASHSCOPE_API_KEY": "your_api_key",
        "DASHSCOPE_BASE_URL": "https://dashscope.aliyuncs.com",
        "DASHSCOPE_MODEL": "qwen-image-2.0-pro"
      }
    }
  }
}
```

如果你还要启用图片理解，可以在同一个 MCP server 配置里增加视觉模型环境变量：

```json
{
  "mcpServers": {
    "image": {
      "command": "node",
      "args": ["/absolute/path/to/z-mcp/image-mcp/dist/index.js"],
      "env": {
        "DASHSCOPE_API_KEY": "your_image_api_key",
        "DASHSCOPE_MODEL": "qwen-image-2.0-pro",
        "VISION_API_KEY": "your_vision_api_key",
        "VISION_MODEL": "your_vision_model"
      }
    }
  }
}
```

## 工具输入示例

```json
{
  "prompt": "一只橘猫坐在木质窗台上，午后阳光，电影感摄影",
  "size": "1024*1024",
  "n": 1,
  "watermark": false
}
```

`edit_image` 示例：

```json
{
  "prompt": "图1只负责画风：保留水彩笔触、低饱和配色、纸张纹理和留白方式。图2只负责主体形象：保留人物脸型、发型、服装配色和身体比例。不要继承图2的背景、摄影风格和光影。生成一个站在海边的人物新场景。",
  "images": [
    "/absolute/path/to/style-reference.png",
    "/absolute/path/to/subject-reference.png"
  ],
  "negative_prompt": "不要写实摄影，不要复杂背景，不要霓虹灯光",
  "size": "1024*1024",
  "n": 1
}
```

单图风格参考模板：

```json
{
  "prompt": "只参考这张图的画风，不参考原主体内容。保留它的构图、背景颜色、阴影方式、线条简洁度、配色倾向和整体气质。新的主体是一个松鼠头像：只保留头部，暖棕色毛发，圆润耳朵，奶油色面部区域，黑色小圆眼睛，小巧微笑嘴，轻微腮红。不要身体、不要服装、不要道具、不要复杂背景、不要写实。",
  "images": [
    "/absolute/path/to/style-reference.png"
  ],
  "negative_prompt": "不要原主体物种特征，不要复杂纹理，不要3D，不要贴纸感，不要复杂光影",
  "size": "1024*1024",
  "n": 1
}
```

双图融合模板：

```json
{
  "prompt": "图1主要提供整体风格、背景和构图。图2主要提供主体形象特征。请融合两者，生成一个新画面。不要直接复制任一参考图。",
  "images": [
    "/absolute/path/to/style-reference.png",
    "/absolute/path/to/subject-reference.png"
  ],
  "negative_prompt": "不要复杂背景，不要额外装饰，不要写实",
  "size": "1024*1024",
  "n": 1
}
```

推荐写法：

- 先判断自己要的是“单图风格迁移”还是“多图融合”
- 明确写出“图1负责风格，图2负责主体形象”
- 明确写出要保留的风格特征，例如笔触、材质、色调、构图倾向
- 明确写出要保留的主体特征，例如脸型、发型、服装、物种特征
- 明确写出不要继承的内容，例如背景、镜头语言、摄影感、光影

不推荐写法：

- “参考图1风格，参考图2人物”
- “按这两张图生成一张新的”
- 只给图片，不说明谁控制风格、谁控制主体
- 用两张都带强风格噪音的图，却要求模型只取其中一张的画风

## `analyze_image` 示例

单图理解：

```json
{
  "prompt": "请描述这张图片里的主体、场景和大致氛围。",
  "images": [
    "/absolute/path/to/reference.png"
  ]
}
```

双图对比：

```json
{
  "prompt": "请比较这两张图在主体、环境和风格上的主要差异。",
  "images": [
    "/absolute/path/to/image-a.png",
    "/absolute/path/to/image-b.png"
  ]
}
```

截图理解：

```json
{
  "prompt": "这是一个应用截图。请概括它当前页面的功能，并指出界面里最重要的操作区域。",
  "images": [
    "/absolute/path/to/screenshot.png"
  ]
}
```
