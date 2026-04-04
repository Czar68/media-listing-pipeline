import type {
  ExecutionRunnerInput,
  ExecutionRunnerResult,
  ExecutionResultItem,
  ExecutionSummary,
} from './types';

function executionSummaryFrom(results: readonly ExecutionResultItem[]): ExecutionSummary {
  let simulatedSuccess = 0;
  let skipped = 0;
  for (const r of results) {
    if (r.type === 'PUBLISH_LISTING' && r.status === 'SIMULATED_SUCCESS') {
      simulatedSuccess += 1;
    }
    if (r.type === 'SKIPPED') {
      skipped += 1;
    }
  }
  return {
    totalActions: results.length,
    simulatedSuccess,
    skipped,
  };
}

/**
 * Deterministic dry-run: maps each planned and skipped action from the plan to a simulated result.
 */
export function runExecutionPlan(input: ExecutionRunnerInput): ExecutionRunnerResult {
  const executionResults: ExecutionResultItem[] = [];

  for (const action of input.plannedActions) {
    executionResults.push({
      type: 'PUBLISH_LISTING',
      reference: action.reference,
      status: 'SIMULATED_SUCCESS',
    });
  }

  for (const skipped of input.skippedActions) {
    executionResults.push({
      type: 'SKIPPED',
      reference: skipped.reference,
      reason: skipped.reason,
    });
  }

  const readonlyResults = executionResults as readonly ExecutionResultItem[];
  return {
    executionSummary: executionSummaryFrom(readonlyResults),
    executionResults: readonlyResults,
  };
}
