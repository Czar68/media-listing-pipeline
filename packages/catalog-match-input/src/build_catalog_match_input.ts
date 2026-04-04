import type { CatalogQueryPlan } from '@media-listing/catalog-query-plan';
import type { NormalizedCatalogRecord } from '@media-listing/catalog-normalization';
import type { IdentityResolutionApplicationResult } from '@media-listing/identity-application';

import type { CatalogMatchInput } from './types';

/**
 * Assembles identity context, query-plan steps, and normalized catalog rows for a later matcher.
 * Pure: no filtering, scoring, or mutation of inputs.
 */
export function buildCatalogMatchInput(
  applicationResult: IdentityResolutionApplicationResult,
  queryPlan: CatalogQueryPlan,
  records: readonly NormalizedCatalogRecord[],
): CatalogMatchInput {
  if (applicationResult.outcome !== 'RESOLVED') {
    return {
      identity: null,
      querySteps: [],
      candidates: [],
    };
  }

  const { candidate } = applicationResult.identitySnapshot;
  return {
    identity: {
      source: candidate.source,
      title: candidate.title,
      productId: candidate.productId,
    },
    querySteps: queryPlan.steps,
    candidates: records,
  };
}
