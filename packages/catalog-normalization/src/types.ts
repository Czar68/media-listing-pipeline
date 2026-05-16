/**
 * Raw catalog record from upstream sources — optional fields may be absent or null.
 */
export interface RawCatalogRecord {
  readonly title?: string | null;
  readonly productId?: string | null;
  readonly region?: string | null;
  readonly mediaFormat?: string | null;
  readonly platform?: string | null;
  readonly genre?: string | null;
  readonly publisher?: string | null;
  readonly esrbRating?: string | null;
  readonly releaseYear?: string | null;
}

/**
 * Deterministic normalized view — every field is explicit; null means missing or unusable after normalization.
 */
export interface NormalizedCatalogRecord {
  readonly title: string | null;
  readonly productId: string | null;
  readonly region: string | null;
  readonly mediaFormat: string | null;
  readonly platform: string | null;
  readonly genre: string | null;
  readonly publisher: string | null;
  readonly esrbRating: string | null;
  readonly releaseYear: string | null;
}
