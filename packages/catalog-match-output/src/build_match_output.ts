import type { CatalogMatchOutputInput, CatalogMatchOutputResult } from './types';

export function buildCatalogMatchOutput(
  input: CatalogMatchOutputInput
): CatalogMatchOutputResult {
  return { matches: input.matches };
}
