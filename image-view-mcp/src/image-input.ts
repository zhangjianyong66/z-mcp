import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import type { ResolvedImage } from "./types.js";

function getMimeType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".bmp":
      return "image/bmp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    default:
      return "application/octet-stream";
  }
}

function parseDataUrl(dataUrl: string): ResolvedImage {
  const match = /^data:(image\/[^;,]+);base64,/.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid data URL. Expected format: data:image/<type>;base64,<data>.");
  }

  return { image: dataUrl };
}

async function fetchRemoteImage(imageUrl: string): Promise<ResolvedImage> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch remote image: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType?.startsWith("image/")) {
    return { image: imageUrl };
  }

  throw new Error(`Remote URL did not return an image content type: ${contentType ?? "unknown"}`);
}

export async function resolveImageInput(image: string): Promise<ResolvedImage> {
  if (image.startsWith("data:image/")) {
    return parseDataUrl(image);
  }

  if (image.startsWith("http://") || image.startsWith("https://")) {
    return fetchRemoteImage(image);
  }

  const fileBuffer = await readFile(image);
  const mimeType = getMimeType(image);
  if (!mimeType.startsWith("image/")) {
    throw new Error(`Unsupported local image type: ${image}`);
  }

  return {
    image: `data:${mimeType};base64,${fileBuffer.toString("base64")}`
  };
}
