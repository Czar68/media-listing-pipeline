import type { CatalogMatchOutputResult } from '@media-listing/catalog-match-output';
import type { RawCatalogRecord } from '@media-listing/catalog-normalization';
import type { IdentityResolutionApplicationResult } from '@media-listing/identity-application';

export type CatalogPipelineInput = {
  readonly identity: IdentityResolutionApplicationResult;
  readonly catalogRecords: readonly RawCatalogRecord[];
};

export type CatalogPipelineOutput = CatalogMatchOutputResult;
