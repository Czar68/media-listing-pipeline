import type { MediaAdapter, NormalizedInventoryItem, RawScanResult } from "./types";

const IMAGE_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
]);

const VIDEO_EXT = new Set([
  ".mp4",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".m4v",
]);

/** Deterministic 32-bit FNV-1a hex string — no external dependencies. */
export function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function extensionLower(path: string): string {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return "";
  return lower.slice(dot);
}

function splitFilesByExtension(files: string[]): { images: string[]; videos: string[] } {
  const images: string[] = [];
  const videos: string[] = [];
  for (const f of files) {
    const ext = extensionLower(f);
    if (IMAGE_EXT.has(ext)) images.push(f);
    else if (VIDEO_EXT.has(ext)) videos.push(f);
  }
  return { images, videos };
}

export class MediaAdapterImpl implements MediaAdapter {
  normalize(input: RawScanResult): NormalizedInventoryItem {
    const title = input.title.trim();
    const description = (input.description ?? "").trim();
    const capturedAt = input.capturedAt;
    const idPart =
      input.externalId ?? simpleHash(`${input.title}${input.capturedAt}`);
    const sku = `${input.source}-${idPart}`;
    const normalizedAt = new Date().toISOString();
    const { images, videos } = splitFilesByExtension(input.files);

    return {
      sku,
      title,
      description,
      media: { images, videos },
      condition: "UNSPECIFIED",
      source: {
        system: "media-listing-pipeline",
        origin: input.source,
        externalId: input.externalId,
      },
      timestamps: {
        capturedAt,
        normalizedAt,
      },
      metadata: input.metadata,
    };
  }
}
