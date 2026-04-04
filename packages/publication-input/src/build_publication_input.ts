import type { PublicationInputInput, PublicationRequestInput } from './types';

export function buildPublicationInput(
  input: PublicationInputInput,
): PublicationRequestInput {
  return {
    listingOutputHandoff: input,
    adapterExecutionContext: null,
    publicationRequestCorrelation: null,
  };
}
