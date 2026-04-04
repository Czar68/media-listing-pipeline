import type {
  PublicationExecutionOutputInput,
  PublicationExecutionOutputResult,
} from './types';

export function buildPublicationExecutionOutput(
  input: PublicationExecutionOutputInput,
): PublicationExecutionOutputResult {
  return {
    executionRequest: input,
    executionOutput: {
      executorResult: null,
      dispatchResult: null,
      executionStatus: null,
    },
  };
}
