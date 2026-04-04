import type { PublicationRunEnvelopeInput, PublicationRunEnvelopeResult } from './types';

export function buildPublicationRunEnvelope(
  input: PublicationRunEnvelopeInput
): PublicationRunEnvelopeResult {
  return {
    manifest: input,
    envelopeMetadata: {
      envelopeId: null,
      createdAt: null,
      transportVersion: null,
    },
    deliveryContext: {
      targetSystem: null,
      priority: null,
    },
  };
}
