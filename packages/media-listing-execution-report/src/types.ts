import type { ExecutionPlanResult, SkippedActionReason } from '@media-listing/media-listing-execution-planner';

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

export type ExecutionReportInput = {
  readonly executionPlan: ExecutionPlanResult;
  readonly executionRun: ExecutionRunnerResult;
};

export type ReportSummary = {
  readonly totalActions: number;
  readonly plannedActions: number;
  readonly skippedActions: number;
  readonly simulatedSuccess: number;
};

export type ExecutionReportResult = {
  readonly executionPlan: ExecutionPlanResult;
  readonly executionRun: ExecutionRunnerResult;
  readonly reportSummary: ReportSummary;
};
