import type { IdentityResolutionApplicationResult } from '@media-listing/identity-application';

import type { CatalogQueryPlan, CatalogQueryStep } from './types';

function trimmedNonEmpty(value: string): string | undefined {
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

/**
 * Pure, deterministic: maps identity-application output to an ordered catalog lookup plan.
 * Does not perform lookups. Non-RESOLVED outcomes yield an empty step list.
 */
export function buildCatalogQueryPlan(
  applicationResult: IdentityResolutionApplicationResult,
): CatalogQueryPlan {
  if (applicationResult.outcome !== 'RESOLVED') {
    return { steps: [] };
  }

  const { candidate } = applicationResult.identitySnapshot;
  const steps: CatalogQueryStep[] = [];

  switch (candidate.source) {
    case 'UPC': {
      const value = trimmedNonEmpty(candidate.productId);
      if (value !== undefined) {
        steps.push({ kind: 'UPC', value });
      }
      break;
    }
    case 'CATALOG': {
      const value = trimmedNonEmpty(candidate.title);
      if (value !== undefined) {
        steps.push({ kind: 'CATALOG_TITLE', value });
      }
      break;
    }
    case 'MANUAL': {
      const value = trimmedNonEmpty(candidate.title);
      if (value !== undefined) {
        steps.push({ kind: 'MANUAL_TITLE', value });
      }
      break;
    }
    default: {
      const _exhaustive: never = candidate.source;
      return _exhaustive;
    }
  }

  return { steps };
}
