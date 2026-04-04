import type { CatalogMatchSelectionInput, CatalogMatchSelectionResult } from './types';

export function selectMatch(
  input: CatalogMatchSelectionInput
): CatalogMatchSelectionResult {
  switch (input.matchKind) {
    case 'UPC_EXACT':
      return { matches: input.matches };
    case 'TITLE_EXACT':
      return { matches: input.matches };
    default:
      return { matches: [] };
  }
}
