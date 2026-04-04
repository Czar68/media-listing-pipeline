import type { ExecutionPlanResult } from '@media-listing/media-listing-execution-planner';
import type { ExecutionRunnerResult } from '@media-listing/media-listing-execution-runner';
import type { ExecutionReportResult } from '@media-listing/media-listing-execution-report';

export type MediaListingExecutionBundleInput = {
  readonly executionPlan: ExecutionPlanResult;
  readonly executionRun: ExecutionRunnerResult;
};

export type MediaListingExecutionBundle = {
  readonly executionPlan: ExecutionPlanResult;
  readonly executionRun: ExecutionRunnerResult;
  readonly executionReport: ExecutionReportResult;
};
