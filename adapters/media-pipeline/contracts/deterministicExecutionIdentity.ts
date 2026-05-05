import { createHash } from "crypto";
import type { CanonicalExecutionListing } from "./pipelineStageContracts";

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Stable deterministic string form for hashing (sorted object keys). */
export function stableSerializeUnknown(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return `s:${JSON.stringify(value)}`;
  if (t === "number" || t === "boolean") return `${t}:${String(value)}`;
  if (t === "bigint") return `bigint:${String(value)}`;
  if (t === "undefined") return "u:";
  if (Array.isArray(value)) {
    return `[${value.map(stableSerializeUnknown).join(",")}]`;
  }
  if (t === "object") {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerializeUnknown(o[k])}`).join(",")}}`;
  }
  return `x:${String(value)}`;
}

/**
 * Replay-stable fingerprint of canonical listings (SKU-sorted).
 * Omits ingest timestamps (`capturedAt` / `normalizedAt`) that legitimately vary per normalization run.
 */
export function stableExecutionBatchIdentity(listings: readonly CanonicalExecutionListing[]): string {
  const sorted = [...listings].sort((a, b) => a.sku.localeCompare(b.sku));
  return sorted
    .map((L) =>
      stableSerializeUnknown({
        sku: L.sku,
        condition: L.condition,
        product: L.product,
        sourceSlice: {
          system: L.sourceMetadata.system,
          origin: L.sourceMetadata.origin,
          externalId: L.sourceMetadata.externalId,
          category: L.sourceMetadata.category,
          epid: L.sourceMetadata.epid,
          matchConfidence: L.sourceMetadata.matchConfidence,
        },
      })
    )
    .join("\u241e");
}

export function createDeterministicRunId(inputBatch: readonly unknown[]): string {
  return sha256Hex(`run|v1|${stableSerializeUnknown(inputBatch)}`);
}

export function createExecutionBatchId(
  runId: string,
  listings: readonly CanonicalExecutionListing[]
): string {
  return sha256Hex(`batch|v1|${runId}|${stableExecutionBatchIdentity(listings)}`);
}

export function createIdempotencyKey(
  runId: string,
  listings: readonly CanonicalExecutionListing[]
): string {
  return sha256Hex(`idem|v1|${runId}|${stableExecutionBatchIdentity(listings)}`);
}

export function createListingExecutionId(runId: string, sku: string): string {
  return sha256Hex(`listing_exec|v1|${runId}|${sku}`);
}

/** ISO timestamp derived from {@link runId} for stable trace anchors (replay-comparable structure). */
export function createDeterministicRunStartedAt(runId: string): string {
  const slice = runId.slice(0, 12);
  const n = Number.parseInt(slice, 16);
  const offsetMs = Number.isFinite(n) ? (n % 86_400_000) * 1000 : 0;
  return new Date(Date.UTC(2000, 0, 1, 0, 0, 0, 0) + offsetMs).toISOString();
}
