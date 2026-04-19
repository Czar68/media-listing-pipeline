/**
 * Scanner contract: emits only {@link RawScanResult} rows. No SKU generation, no trimming
 * of marketplace fields, no eBay or adapter normalization — ingestion shape only.
 */
import type { RawScanResult } from "./types";

const RESERVED_KEYS = new Set([
  "title",
  "description",
  "externalId",
  "files",
  "mediaType",
  "metadata",
  "capturedAt",
  "source",
]);

export type ScanBatchOptions = {
  /** Default `RawScanResult.source` when a row omits `source`. */
  readonly defaultSource?: string;
  /** ISO timestamp when rows omit `capturedAt`. */
  readonly capturedAt?: string;
};

function parseMediaType(value: unknown): RawScanResult["mediaType"] {
  if (value === "image" || value === "video" || value === "audio" || value === "unknown") {
    return value;
  }
  return "unknown";
}

function ingestFiles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}

/**
 * Batch scanner — maps opaque rows to {@link RawScanResult} without trimming, hashing, or marketplace logic.
 */
export function scanBatchRawItems(
  items: readonly unknown[],
  options?: ScanBatchOptions
): RawScanResult[] {
  const defaultSource = options?.defaultSource ?? "media-batch-scan";
  const batchCapturedAt = options?.capturedAt ?? new Date().toISOString();

  return items.map((item) => ingestRow(item, defaultSource, batchCapturedAt));
}

function ingestRow(item: unknown, defaultSource: string, batchCapturedAt: string): RawScanResult {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    return {
      source: defaultSource,
      title: "",
      mediaType: "unknown",
      files: [],
      capturedAt: batchCapturedAt,
      metadata: { _raw: item },
    };
  }

  const o = item as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title : "";
  const description = typeof o.description === "string" ? o.description : undefined;
  const externalId = typeof o.externalId === "string" ? o.externalId : undefined;
  const source = typeof o.source === "string" && o.source.length > 0 ? o.source : defaultSource;
  const capturedAt =
    typeof o.capturedAt === "string" && o.capturedAt.length > 0 ? o.capturedAt : batchCapturedAt;

  const baseMeta =
    typeof o.metadata === "object" && o.metadata !== null && !Array.isArray(o.metadata)
      ? { ...(o.metadata as Record<string, unknown>) }
      : {};

  for (const [key, value] of Object.entries(o)) {
    if (!RESERVED_KEYS.has(key)) {
      baseMeta[key] = value;
    }
  }

  return {
    source,
    externalId,
    title,
    description,
    mediaType: parseMediaType(o.mediaType),
    files: ingestFiles(o.files),
    metadata: Object.keys(baseMeta).length > 0 ? baseMeta : undefined,
    capturedAt,
  };
}
