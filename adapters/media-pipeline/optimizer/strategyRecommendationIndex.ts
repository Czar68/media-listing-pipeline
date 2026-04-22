import { compareLatestRuns, listRunPerformances } from "../intelligence/runPerformanceIndex";
import {
  comparePolicyAcrossRuns,
  computeStrategyAdjustmentPolicy,
  type PolicyComparison,
  type StrategyAdjustmentPolicy,
} from "./strategyFeedbackOptimizer";

/**
 * Builds a {@link StrategyAdjustmentPolicy} from the `runCount` most recent persisted runs
 * (read-only via {@link listRunPerformances}).
 */
export async function getPolicyForLatestRuns(
  runCount: number = 5
): Promise<StrategyAdjustmentPolicy> {
  const capped = Math.max(1, Math.min(10, Math.floor(runCount)));
  const runs = await listRunPerformances(capped);
  const comparisons =
    capped >= 2 ? await compareLatestRuns(capped) : ([] as const);
  return computeStrategyAdjustmentPolicy({
    runs,
    pairwiseComparisons: comparisons.length > 0 ? comparisons : undefined,
  });
}

export { comparePolicyAcrossRuns } from "./strategyFeedbackOptimizer";
export type { PolicyComparison } from "./strategyFeedbackOptimizer";

/** Read-only entry points for strategy feedback recommendations. */
export const strategyRecommendationIndex = {
  getPolicyForLatestRuns,
  comparePolicyAcrossRuns,
};
