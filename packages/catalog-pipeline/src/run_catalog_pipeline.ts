import { buildCatalogMatchInput } from '@media-listing/catalog-match-input';
import { matchCatalog } from '@media-listing/catalog-match-orchestrator';
import { buildCatalogMatchOutput } from '@media-listing/catalog-match-output';
import { selectMatch } from '@media-listing/catalog-match-selection';
import { matchCatalogByUpc } from '@media-listing/catalog-matcher';
import { normalizeCatalogRecord } from '@media-listing/catalog-normalization';
import { buildCatalogQueryPlan } from '@media-listing/catalog-query-plan';
import { matchCatalogByTitle } from '@media-listing/catalog-title-matcher';

import type { CatalogPipelineInput, CatalogPipelineOutput } from './types';

export function runCatalogPipeline(
  input: CatalogPipelineInput,
): CatalogPipelineOutput {
  const queryPlan = buildCatalogQueryPlan(input.identity);
  const normalizedRecords = input.catalogRecords.map((record) =>
    normalizeCatalogRecord(record),
  );
  const matchInput = buildCatalogMatchInput(
    input.identity,
    queryPlan,
    normalizedRecords,
  );
  matchCatalogByUpc(matchInput);
  matchCatalogByTitle(matchInput);
  const orchestratorResult = matchCatalog(matchInput);
  const selectionResult = selectMatch(orchestratorResult);
  return buildCatalogMatchOutput(selectionResult);
}
