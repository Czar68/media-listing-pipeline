/**
 * Ordered downstream catalog lookup steps — query kind and value only, no execution.
 */
export type CatalogQueryStep =
  | { readonly kind: 'UPC'; readonly value: string }
  | { readonly kind: 'CATALOG_TITLE'; readonly value: string }
  | { readonly kind: 'MANUAL_TITLE'; readonly value: string };

export interface CatalogQueryPlan {
  readonly steps: readonly CatalogQueryStep[];
}
