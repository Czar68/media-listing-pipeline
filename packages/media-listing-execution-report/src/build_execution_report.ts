import type { ExecutionReportInput, ExecutionReportResult, ReportSummary } from './types';

function reportSummaryFrom(input: ExecutionReportInput): ReportSummary {
  return {
    totalActions: input.executionRun.executionSummary.totalActions,
    plannedActions: input.executionPlan.planSummary.publishableListings,
    skippedActions: input.executionPlan.planSummary.skippedListings,
    simulatedSuccess: input.executionRun.executionSummary.simulatedSuccess,
  };
}

export function buildExecutionReport(input: ExecutionReportInput): ExecutionReportResult {
  return {
    executionPlan: input.executionPlan,
    executionRun: input.executionRun,
    reportSummary: reportSummaryFrom(input),
  };
}
