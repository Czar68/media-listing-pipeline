import type { NormalizedValidationReport, ValidationRunComparison } from "./normalizeValidationReport";
import { compareValidationRuns } from "./normalizeValidationReport";
import {
  buildEvaluationInsights,
  buildListingQualityComparisonBlock,
  computeListingQualityScore,
} from "./listingQualityScore";
import type { EvaluationInsights } from "./validationScoringTypes";

/**
 * EPID-disabled vs EPID-enabled comparison with listing-quality scores and insights.
 * Keeps {@link compareValidationRuns} as the slice diff source; adds scoring only here.
 */
export function buildEpidListingQualityComparison(normalizedReport: NormalizedValidationReport): {
  readonly comparison: ValidationRunComparison;
  readonly insights: EvaluationInsights;
} {
  const diff = compareValidationRuns(
    normalizedReport.epidDisabled,
    normalizedReport.epidEnabled
  );
  const scores = computeListingQualityScore(normalizedReport);
  const listingQuality = buildListingQualityComparisonBlock(scores);
  const insights = buildEvaluationInsights(
    normalizedReport,
    diff,
    scores,
    listingQuality.epidEffectScoreDelta,
    listingQuality.breakdown
  );

  const comparison: ValidationRunComparison = {
    ...diff,
    schemaVersion: 3,
    listingQuality,
  };

  return { comparison, insights };
}
