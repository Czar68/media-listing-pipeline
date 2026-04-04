import type { PublicationExecutionRequestResult } from '@media-listing/publication-execution-request';

export type PublicationExecutionOutputInput = PublicationExecutionRequestResult;

export type PublicationExecutionOutputFields = {
  readonly executorResult: null;
  readonly dispatchResult: null;
  readonly executionStatus: null;
};

export type PublicationExecutionOutputResult = {
  readonly executionRequest: PublicationExecutionOutputInput;
  readonly executionOutput: PublicationExecutionOutputFields;
};
