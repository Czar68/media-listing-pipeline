import type { PublicationBatchInput, PublicationBatchResult } from './types';

/**
 * Deterministic structural mapping only: carries adapter payload references through unchanged.
 */
export function buildPublicationBatch(
  input: PublicationBatchInput
): PublicationBatchResult {
  return {
    adapterPayloads: input,
    batchContext: {
      batchId: null,
      submittedAt: null,
      publisherRunRef: null,
    },
    batchPolicy: {
      orderingStrategy: null,
      maxBatchSize: null,
      dryRun: null,
    },
  };
}
