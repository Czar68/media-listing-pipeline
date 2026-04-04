import type { PublicationRequestInput } from '@media-listing/publication-input';

export type PublicationRequestBuilderInput = PublicationRequestInput;

/**
 * Explicit publication request for downstream adapters and executors.
 * Preserves the publication-input contract; fields not derivable from
 * publication-input are explicit null placeholders.
 */
export type PublicationRequestResult = {
  readonly publicationInputContract: PublicationRequestInput;
  /** Not produced by publication-input; adapter/executor binding (filled by runtime). */
  readonly adapterExecutorBinding: null;
  /** Not produced by publication-input; dispatch or attempt metadata for execution. */
  readonly publicationDispatchMetadata: null;
};
