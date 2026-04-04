import type {
  PublicationAdapterInput,
  PublicationAdapterPayloadResult,
} from './types';

export function buildPublicationAdapterPayload(
  input: PublicationAdapterInput,
): PublicationAdapterPayloadResult {
  return {
    publicationRequestContract: input,
    adapterPayload: {
      publicationInputContract: input.publicationInputContract,
      adapterExecutionContext: {
        adapterName: null,
        adapterAccountRef: null,
        adapterEnvironment: null,
      },
      adapterSubmission: {
        submissionMode: null,
        idempotencyKey: null,
        externalListingRef: null,
      },
    },
  };
}
