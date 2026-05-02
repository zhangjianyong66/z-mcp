import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { generateVideoFromFirstFrame, generateVideoFromFrames } from "./service.js";

function toToolError(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}

const server = new McpServer({
  name: "video-mcp",
  version: "0.3.0"
});

const commonSchema = {
  prompt: z.string().min(1).optional().describe("可选提示词，建议填写以控制画面变化。"),
  model: z.string().min(1).optional().describe("可选模型名，默认读取 DASHSCOPE_VIDEO_MODEL。"),
  resolution: z.enum(["480P", "720P", "1080P"]).optional().describe("可选分辨率，默认 720P。"),
  duration: z.number().int().min(2).max(15).optional().describe("可选视频时长（秒）。wan2.7 i2v 支持 2-15；legacy kf2v 固定为 5。"),
  prompt_extend: z.boolean().optional().describe("是否启用智能改写 prompt，默认 true。"),
  watermark: z.boolean().optional().describe("是否添加水印，默认 true。"),
  save_to_local: z.boolean().optional().describe("是否在生成成功后自动下载保存到本地，默认 true。"),
  output_filename: z.string().min(1).optional().describe("可选输出文件名（.mp4 可省略）。"),
  poll_interval_ms: z.number().int().min(1000).max(60000).optional().describe("轮询间隔毫秒，默认 3000。"),
  timeout_ms: z.number().int().min(10000).max(1200000).optional().describe("总超时毫秒，默认 180000。")
};

server.tool(
  "generate_video_from_frames",
  "基于首帧图和尾帧图生成无声视频（DashScope）。自动根据模型切换 wan2.7 i2v 与 legacy kf2v 接口，并轮询直到任务完成。",
  {
    first_frame_url: z.string().min(1).describe("首帧图像 URL、oss:// URL、本地 file:// 路径或 data:image/... base64。"),
    last_frame_url: z.string().min(1).describe("尾帧图像 URL、oss:// URL、本地 file:// 路径或 data:image/... base64。"),
    ...commonSchema
  },
  async (input) => {
    try {
      const result = await generateVideoFromFrames(input);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

server.tool(
  "generate_video_from_first_frame",
  "基于首帧图生成视频（DashScope wan2.7/happyhorse i2v）。自动轮询直到任务完成。",
  {
    first_frame_url: z.string().min(1).describe("首帧图像 URL、oss:// URL、本地 file:// 路径或 data:image/... base64。"),
    ...commonSchema
  },
  async (input) => {
    try {
      const result = await generateVideoFromFirstFrame(input);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return toToolError(error);
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
