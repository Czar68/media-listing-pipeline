import type { ExecutionPlanResult, SkippedActionReason } from '@media-listing/media-listing-execution-planner';

/**
 * Runner input: deterministic execution plan only (no pipeline or snapshot data).
 */
export type ExecutionRunnerInput = ExecutionPlanResult;

export type SimulatedPublishExecutionResult = {
  readonly type: 'PUBLISH_LISTING';
  readonly reference: number;
  readonly status: 'SIMULATED_SUCCESS';
};

export type SkippedExecutionResult = {
  readonly type: 'SKIPPED';
  readonly reference: number;
  readonly reason: SkippedActionReason;
};

export type ExecutionResultItem = SimulatedPublishExecutionResult | SkippedExecutionResult;

export type ExecutionSummary = {
  readonly totalActions: number;
  readonly simulatedSuccess: number;
  readonly skipped: number;
};

export type ExecutionRunnerResult = {
  readonly executionSummary: ExecutionSummary;
  readonly executionResults: readonly ExecutionResultItem[];
};
