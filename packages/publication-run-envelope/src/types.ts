type PublicationRunManifestResult = unknown;

export type PublicationRunEnvelopeInput = PublicationRunManifestResult;

export type PublicationRunEnvelopeResult = {
  readonly manifest: PublicationRunManifestResult;
  readonly envelopeMetadata: {
    readonly envelopeId: null;
    readonly createdAt: null;
    readonly transportVersion: null;
  };
  readonly deliveryContext: {
    readonly targetSystem: null;
    readonly priority: null;
  };
};
