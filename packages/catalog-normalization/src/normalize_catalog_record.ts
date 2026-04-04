import type { NormalizedCatalogRecord, RawCatalogRecord } from './types';

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const collapsed = value.trim().replace(/\s+/g, ' ');
  return collapsed.length > 0 ? collapsed : null;
}

/**
 * Pure, deterministic normalization: trim, collapse internal whitespace, map unusable values to null.
 */
export function normalizeCatalogRecord(input: RawCatalogRecord): NormalizedCatalogRecord {
  return {
    title: normalizeOptionalString(input.title),
    productId: normalizeOptionalString(input.productId),
    region: normalizeOptionalString(input.region),
    mediaFormat: normalizeOptionalString(input.mediaFormat),
  };
}
