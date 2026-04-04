/**
 * Listing preparation input — deterministic seam from catalog pipeline output.
 * Fields mirror resolved catalog rows only; no pricing, condition, or marketplace data at this boundary.
 */
export type ListingPreparationCatalogRecord = {
  readonly title: string | null;
  readonly productId: string | null;
  readonly region: string | null;
  readonly mediaFormat: string | null;
};

export type ListingPreparationInput = {
  readonly matches: readonly ListingPreparationCatalogRecord[];
};
