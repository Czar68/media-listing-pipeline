import type { PublicationRunEnvelopeResult } from '@media-listing/publication-run-envelope';

export type PublicationExecutionIntentInput = PublicationRunEnvelopeResult;

export type PublicationExecutionIntentFields = {
  readonly mode: null;
  readonly trigger: null;
  readonly retryPolicy: null;
};

export type PublicationExecutionIntentResult = {
  readonly envelope: PublicationExecutionIntentInput;
  readonly executionIntent: PublicationExecutionIntentFields;
};
