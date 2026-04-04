import type {
  PublicationRequestBuilderInput,
  PublicationRequestResult,
} from './types';

export function buildPublicationRequest(
  input: PublicationRequestBuilderInput,
): PublicationRequestResult {
  return {
    publicationInputContract: input,
    adapterExecutorBinding: null,
    publicationDispatchMetadata: null,
  };
}
