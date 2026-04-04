import type {
  PublicationExecutionRequestInput,
  PublicationExecutionRequestResult,
} from './types';

export function buildPublicationExecutionRequest(
  input: PublicationExecutionRequestInput,
): PublicationExecutionRequestResult {
  return {
    executionIntent: input,
    executionRequest: {
      executor: null,
      dispatchPolicy: null,
      executionContext: null,
    },
  };
}
