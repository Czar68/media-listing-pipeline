import type { CatalogMatchCandidate } from '@media-listing/catalog-match-orchestrator';
import type { CatalogMatchOrchestratorResult } from '@media-listing/catalog-match-orchestrator';

export type CatalogMatchSelectionResult = {
  readonly matches: readonly CatalogMatchCandidate[];
};

export type CatalogMatchSelectionInput = CatalogMatchOrchestratorResult;
