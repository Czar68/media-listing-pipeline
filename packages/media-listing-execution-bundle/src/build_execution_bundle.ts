import { buildExecutionReport } from '@media-listing/media-listing-execution-report';
import type { MediaListingExecutionBundle, MediaListingExecutionBundleInput } from './types';

export function buildExecutionBundle(input: MediaListingExecutionBundleInput): MediaListingExecutionBundle {
  const executionReport = buildExecutionReport(input);
  return {
    executionPlan: input.executionPlan,
    executionRun: input.executionRun,
    executionReport,
  };
}
