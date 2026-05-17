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

const PLATFORM_CODES: Record<string, string> = {
  "playstation 4": "PS4",
  "playstation 5": "PS5",
  "playstation 3": "PS3",
  "xbox one": "XB1",
  "xbox series x": "XSX",
  "xbox series s": "XSS",
  "xbox 360": "X360",
  "nintendo switch": "NSW",
  "nintendo wii": "WII",
  "nintendo wii u": "WIIU",
  "nintendo 3ds": "3DS",
  "nintendo ds": "NDS",
  "pc": "PC",
  "playstation 1": "PS1",
  "playstation": "PS1",
  "playstation 2": "PS2",
  "psx": "PS1",
  "ps1": "PS1",
  "ps2": "PS2",
  "ps3": "PS3",
  "ps4": "PS4",
  "ps5": "PS5",
  "xbox": "XB1",
  "gameboy": "GBA",
  "gameboy advance": "GBA",
  "gameboy color": "GBC",
  "game boy": "GBA",
  "sega genesis": "GEN",
  "sega saturn": "SAT",
  "sega dreamcast": "DC",
  "n64": "N64",
  "nintendo 64": "N64",
  "gamecube": "GCN",
};

function resolvePlatformCode(platform: string): string {
  const key = platform.trim().toLowerCase();
  return PLATFORM_CODES[key] ?? platform.trim().toUpperCase().replace(/\s+/g, '_').slice(0, 8);
}

function buildSku(input: RawScanResult): string {
  const meta = input.metadata;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const m = meta as Record<string, unknown>;
    const upc = typeof m.upc === 'string' ? m.upc.trim().replace(/\D/g, '') : '';
    if (upc.length >= 8) {
      return `${upc}-A`;
    }
    const platform = typeof m.platform === 'string' ? m.platform.trim() : '';
    if (platform.length > 0) {
      const code = resolvePlatformCode(platform);
      const titleHash = simpleHash(`${input.title}${input.capturedAt}`).slice(0, 6);
      return `${code}-${titleHash}-A`;
    }
  }
  const idPart = input.externalId ?? simpleHash(`${input.title}${input.capturedAt}`);
  return `${input.source}-${idPart}`;
}

export class MediaAdapterImpl implements MediaAdapter {
  normalize(input: RawScanResult): NormalizedInventoryItem {
    const title = input.title.trim();
    const description = (input.description ?? "").trim();
    const capturedAt = input.capturedAt;
    const sku = buildSku(input);
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
