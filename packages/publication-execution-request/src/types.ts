import type { PublicationExecutionIntentResult } from '@media-listing/publication-execution-intent';

export type PublicationExecutionRequestInput = PublicationExecutionIntentResult;

export type PublicationExecutionRequestFields = {
  readonly executor: null;
  readonly dispatchPolicy: null;
  readonly executionContext: null;
};

export type PublicationExecutionRequestResult = {
  readonly executionIntent: PublicationExecutionRequestInput;
  readonly executionRequest: PublicationExecutionRequestFields;
};
