import type {
  PublicationExecutionIntentInput,
  PublicationExecutionIntentResult,
} from './types';

export function buildPublicationExecutionIntent(
  input: PublicationExecutionIntentInput,
): PublicationExecutionIntentResult {
  return {
    envelope: input,
    executionIntent: {
      mode: null,
      trigger: null,
      retryPolicy: null,
    },
  };
}
