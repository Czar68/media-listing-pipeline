import type { CatalogQueryStep } from '@media-listing/catalog-query-plan';
import type { NormalizedCatalogRecord } from '@media-listing/catalog-normalization';

/** Identity candidate source aligned with applied resolution (core-identity candidate source). */
export type CatalogMatchIdentitySource = 'CATALOG' | 'UPC' | 'MANUAL';

/** Explicit fields from the resolved identity snapshot for downstream comparison context. */
export interface CatalogMatchIdentityContext {
  readonly source: CatalogMatchIdentitySource;
  readonly title: string;
  readonly productId: string;
}

/** Normalized catalog row as a readonly matcher candidate (no copying or filtering here). */
export type CatalogMatchCandidate = NormalizedCatalogRecord;

export interface CatalogMatchInput {
  readonly identity: CatalogMatchIdentityContext | null;
  readonly querySteps: readonly CatalogQueryStep[];
  readonly candidates: readonly CatalogMatchCandidate[];
}
