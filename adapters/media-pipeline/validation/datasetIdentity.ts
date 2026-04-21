import { createHash } from "crypto";
import type { ScanBatchOptions } from "../scanner";
import { simpleHash } from "../mediaAdapter";
import { stableStringify } from "./jsonStable";

export interface CanonicalSkuTitleRow {
  readonly sku: string;
  readonly title: string;
}

function sha256Hex(utf8: string): string {
  return createHash("sha256").update(utf8, "utf8").digest("hex");
}

/**
 * Derives SKU/title pairs aligned with {@link MediaAdapterImpl.normalize} identity rules
 * (same defaultSource + externalId → SKU; else hash of title + capturedAt).
 */
export function buildCanonicalSkuTitleRows(
  items: readonly unknown[],
  scanOptions: ScanBatchOptions
): CanonicalSkuTitleRow[] {
  const defaultSource = scanOptions.defaultSource ?? "media-batch-scan";
  const batchCapturedAt = scanOptions.capturedAt ?? new Date().toISOString();
  const rows: CanonicalSkuTitleRow[] = [];

  for (const item of items) {
    if (item === null || typeof item !== "object") {
      continue;
    }
    const o = item as Record<string, unknown>;
    const rawTitle = typeof o.title === "string" ? o.title : "";
    const capturedAt = typeof o.capturedAt === "string" ? o.capturedAt : batchCapturedAt;
    const externalId = o.externalId !== undefined && o.externalId !== null ? String(o.externalId) : undefined;
    const idPart = externalId ?? simpleHash(`${rawTitle}${capturedAt}`);
    const sku = `${defaultSource}-${idPart}`;
    const title = rawTitle.trim();
    rows.push({ sku, title });
  }

  rows.sort((a, b) => a.sku.localeCompare(b.sku, "en"));
  return rows;
}

/**
 * Deterministic hash over sorted (sku, title) rows only.
 */
export function computeDatasetContentHash(rows: readonly CanonicalSkuTitleRow[]): string {
  return sha256Hex(stableStringify(rows));
}

/**
 * Stable dataset id: same canonical rows → same id across process runs.
 */
export function deriveDatasetId(contentHash: string): string {
  return `advds_${contentHash}`;
}

export interface ResolvedDatasetIdentity {
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly contentHash: string;
  readonly canonicalRows: readonly CanonicalSkuTitleRow[];
}

export function resolveDatasetIdentity(
  items: readonly unknown[],
  scanOptions: ScanBatchOptions,
  datasetDefinitionVersion: string
): ResolvedDatasetIdentity {
  const canonicalRows = buildCanonicalSkuTitleRows(items, scanOptions);
  const contentHash = computeDatasetContentHash(canonicalRows);
  const datasetId = deriveDatasetId(contentHash);
  return {
    datasetId,
    datasetVersion: datasetDefinitionVersion,
    contentHash,
    canonicalRows,
  };
}
