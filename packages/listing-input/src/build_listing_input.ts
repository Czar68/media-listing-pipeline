import type { CatalogPipelineOutput } from '@media-listing/catalog-pipeline';

import type { ListingPreparationInput } from './types';

export function buildListingInput(
  catalogPipelineOutput: CatalogPipelineOutput,
): ListingPreparationInput {
  return {
    matches: catalogPipelineOutput.matches.map((row) => ({
      title: row.title,
      productId: row.productId,
      region: row.region,
      mediaFormat: row.mediaFormat,
    })),
  };
}
