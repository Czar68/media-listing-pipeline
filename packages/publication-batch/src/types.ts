import type { PublicationAdapterPayloadResult } from '@media-listing/publication-adapter';

/** Batch seam input: zero or more adapter payload results, order preserved. */
export type PublicationBatchInput = readonly PublicationAdapterPayloadResult[];

export type PublicationBatchContext = {
  readonly batchId: null;
  readonly submittedAt: null;
  readonly publisherRunRef: null;
};

export type PublicationBatchPolicy = {
  readonly orderingStrategy: null;
  readonly maxBatchSize: null;
  readonly dryRun: null;
};

/**
 * Pre-execution batch work unit: adapter payloads unchanged, batch/publisher fields explicit placeholders.
 */
export type PublicationBatchResult = {
  readonly adapterPayloads: PublicationBatchInput;
  readonly batchContext: PublicationBatchContext;
  readonly batchPolicy: PublicationBatchPolicy;
};
