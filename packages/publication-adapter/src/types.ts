import type { PublicationRequestResult } from '@media-listing/publication-request';

/** Adapter seam input: upstream publication request result only. */
export type PublicationAdapterInput = PublicationRequestResult;

export type AdapterExecutionContext = {
  readonly adapterName: null;
  readonly adapterAccountRef: null;
  readonly adapterEnvironment: null;
};

export type AdapterSubmission = {
  readonly submissionMode: null;
  readonly idempotencyKey: null;
  readonly externalListingRef: null;
};

export type AdapterPayload = {
  /** Same object reference as `publicationRequestContract.publicationInputContract` from the builder input. */
  readonly publicationInputContract: PublicationRequestResult['publicationInputContract'];
  readonly adapterExecutionContext: AdapterExecutionContext;
  readonly adapterSubmission: AdapterSubmission;
};

/**
 * Adapter-facing contract: preserved publication request plus explicit adapter execution placeholders.
 */
export type PublicationAdapterPayloadResult = {
  readonly publicationRequestContract: PublicationRequestResult;
  readonly adapterPayload: AdapterPayload;
};
