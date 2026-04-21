import type { ErrorType } from "../execution/types";
import type { NormalizedExecutionSlice, NormalizedValidationReport } from "./normalizeValidationReport";
import { ALL_ERROR_TYPES_ORDERED } from "./normalizeValidationReport";
import type {
  EvaluationInsights,
  ListingQualityBreakdown,
  ListingQualityComparison,
  ListingQualityScore,
} from "./validationScoringTypes";

/** Deterministic severity weights (higher = worse for execution quality). */
export const ERROR_TYPE_SEVERITY_WEIGHT: Record<ErrorType, number> = {
  AUTH_ERROR: 1,
  VALIDATION_ERROR: 0.92,
  RATE_LIMIT: 0.78,
  NETWORK_ERROR: 0.72,
  SANDBOX_LIMITATION: 0.58,
  UNKNOWN: 0.65,
};

export const LISTING_QUALITY_WEIGHTS = {
  successMax: 62,
  errorPenaltyMax: 38,
  recoveryMax: 12,
  epidCoverageMax: 6,
  outcomeImprovementMax: 8,
} as const;

export type { ListingQualityScore, ListingQualityComparison, EvaluationInsights } from "./validationScoringTypes";

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function weightedErrorPressure(dist: Record<ErrorType, number>, totalItems: number): number {
  if (totalItems <= 0) return 0;
  let sum = 0;
  for (const t of ALL_ERROR_TYPES_ORDERED) {
    sum += (dist[t] ?? 0) * ERROR_TYPE_SEVERITY_WEIGHT[t];
  }
  return sum / totalItems;
}

export function countOutcomeImprovements(
  baseline: NormalizedExecutionSlice,
  compare: NormalizedExecutionSlice
): number {
  const baseMap = new Map(baseline.items.map((r) => [r.sku, r.outcome]));
  let n = 0;
  for (const row of compare.items) {
    if (baseMap.get(row.sku) === "failed" && row.outcome === "success") {
      n += 1;
    }
  }
  return n;
}

function scoreSlice(
  slice: NormalizedExecutionSlice,
  phase: ListingQualityScore["phase"],
  outcomeImprovements: number,
  isEpidEnabledPhase: boolean
): ListingQualityScore {
  const t = Math.max(1, slice.totalItems);
  const sr = clamp01(slice.successRate);

  const successWeight = round4(sr * LISTING_QUALITY_WEIGHTS.successMax);

  const pressure = weightedErrorPressure(slice.errorTypeDistribution, slice.totalItems);
  const errorPenalty = round4(
    Math.min(LISTING_QUALITY_WEIGHTS.errorPenaltyMax, pressure * LISTING_QUALITY_WEIGHTS.errorPenaltyMax)
  );

  const rec = slice.recovery.recoveredSuccesses;
  const recoveryBonus = round4(
    Math.min(LISTING_QUALITY_WEIGHTS.recoveryMax, (rec / t) * LISTING_QUALITY_WEIGHTS.recoveryMax)
  );

  let epidBonus = 0;
  if (isEpidEnabledPhase && slice.epidEnrichment !== undefined) {
    const cov = slice.epidEnrichment.withEpid / t;
    const coveragePts = round4(cov * LISTING_QUALITY_WEIGHTS.epidCoverageMax);
    const improvePts = round4(
      Math.min(
        LISTING_QUALITY_WEIGHTS.outcomeImprovementMax,
        (outcomeImprovements / t) * LISTING_QUALITY_WEIGHTS.outcomeImprovementMax * 2
      )
    );
    epidBonus = round4(coveragePts + improvePts);
  }

  const raw = successWeight - errorPenalty + recoveryBonus + epidBonus;
  const finalScore = round4(Math.min(100, Math.max(0, raw)));

  return {
    phase,
    successWeight,
    errorPenalty,
    recoveryBonus,
    epidBonus,
    finalScore,
  };
}

/**
 * Listing quality for EPID-off vs EPID-on slices (mock execution only). Deterministic rounding.
 */
export function computeListingQualityScore(normalizedReport: NormalizedValidationReport): {
  readonly epidDisabled: ListingQualityScore;
  readonly epidEnabled: ListingQualityScore;
} {
  const dis = normalizedReport.epidDisabled;
  const en = normalizedReport.epidEnabled;
  const improvements = countOutcomeImprovements(dis, en);

  const epidDisabled = scoreSlice(dis, "epid_disabled", 0, false);
  const epidEnabled = scoreSlice(en, "epid_enabled", improvements, true);

  return { epidDisabled, epidEnabled };
}

function buildBreakdown(a: ListingQualityScore, b: ListingQualityScore) {
  return {
    successWeightDelta: round4(b.successWeight - a.successWeight),
    errorPenaltyDelta: round4(b.errorPenalty - a.errorPenalty),
    recoveryBonusDelta: round4(b.recoveryBonus - a.recoveryBonus),
    epidBonusDelta: round4(b.epidBonus - a.epidBonus),
  };
}

export interface EpidRunDiffForInsights {
  readonly successRateDelta: number;
  readonly failureRateDelta: number;
  readonly errorTypeShifts: Record<ErrorType, number>;
  readonly recoveryDelta: {
    readonly recoveredSuccesses: number;
    readonly recoveredFailures: number;
    readonly retriesObserved: number;
  };
  readonly perSkuOutcomeChanges: readonly {
    readonly sku: string;
    readonly baselineOutcome: "success" | "failed";
    readonly compareOutcome: "success" | "failed";
  }[];
}

function appendComponentDriverLines(lines: string[], b: ListingQualityBreakdown): void {
  if (b.successWeightDelta !== 0) {
    lines.push(
      `Score component: success-weight delta ${b.successWeightDelta} (EPID-enabled minus EPID-disabled mock runs).`
    );
  }
  if (b.errorPenaltyDelta !== 0) {
    lines.push(
      `Score component: error-penalty delta ${b.errorPenaltyDelta} (positive means higher penalty on EPID-enabled).`
    );
  }
  if (b.recoveryBonusDelta !== 0) {
    lines.push(
      `Score component: recovery-bonus delta ${b.recoveryBonusDelta} (recovered-successes contribution).`
    );
  }
  if (b.epidBonusDelta !== 0) {
    lines.push(
      `Score component: EPID bonus delta ${b.epidBonusDelta} (coverage + outcome-improvement terms on EPID-enabled).`
    );
  }
}

export function buildEvaluationInsights(
  normalizedReport: NormalizedValidationReport,
  diff: EpidRunDiffForInsights,
  scores: { epidDisabled: ListingQualityScore; epidEnabled: ListingQualityScore },
  epidEffectScoreDelta: number,
  listingQualityBreakdown: ListingQualityBreakdown
): EvaluationInsights {
  const lines: string[] = [];
  const srPct = round4(diff.successRateDelta * 100);
  if (srPct > 0) {
    lines.push(
      `EPID improves execution success rate by ${srPct} percentage points (EPID-enabled minus EPID-disabled mock runs).`
    );
  } else if (srPct < 0) {
    lines.push(
      `EPID is associated with a ${Math.abs(srPct)} percentage point lower execution success rate versus EPID-disabled mock runs.`
    );
  } else {
    lines.push(
      "EPID does not change execution success rate between EPID-disabled and EPID-enabled mock runs for this dataset."
    );
  }

  lines.push(
    `Listing quality score (0–100): EPID-disabled ${scores.epidDisabled.finalScore}, EPID-enabled ${scores.epidEnabled.finalScore} (delta ${round4(epidEffectScoreDelta)}).`
  );

  for (const t of ALL_ERROR_TYPES_ORDERED) {
    const delta = diff.errorTypeShifts[t];
    if (delta === 0) continue;
    const verb = delta < 0 ? "reduces" : "increases";
    lines.push(`EPID ${verb} ${t} occurrences by ${Math.abs(delta)} (EPID-enabled minus EPID-disabled).`);
  }

  const rd = diff.recoveryDelta.recoveredSuccesses;
  if (rd !== 0) {
    lines.push(`Recovered-success count shifts by ${rd} (compare minus baseline mock runs).`);
  }

  lines.push(
    `Outcome changes at SKU level when enabling EPID: ${diff.perSkuOutcomeChanges.length} SKU(s) with different success/failure outcome.`
  );

  appendComponentDriverLines(lines, listingQualityBreakdown);

  const sortedLines = [...lines].sort((a, b) => a.localeCompare(b, "en"));

  const errorOccurrenceDeltas: Record<ErrorType, number> = {
    AUTH_ERROR: 0,
    NETWORK_ERROR: 0,
    RATE_LIMIT: 0,
    SANDBOX_LIMITATION: 0,
    UNKNOWN: 0,
    VALIDATION_ERROR: 0,
  };
  for (const t of ALL_ERROR_TYPES_ORDERED) {
    errorOccurrenceDeltas[t] = diff.errorTypeShifts[t];
  }

  return {
    summaryLines: sortedLines,
    metrics: {
      successRateDelta: diff.successRateDelta,
      failureRateDelta: diff.failureRateDelta,
      finalScoreDelta: round4(epidEffectScoreDelta),
      errorOccurrenceDeltas,
      recoverySuccessesDelta: diff.recoveryDelta.recoveredSuccesses,
      outcomeImprovementsWithEpid: countOutcomeImprovements(
        normalizedReport.epidDisabled,
        normalizedReport.epidEnabled
      ),
      componentScoreDeltas: {
        successWeight: listingQualityBreakdown.successWeightDelta,
        errorPenalty: listingQualityBreakdown.errorPenaltyDelta,
        recoveryBonus: listingQualityBreakdown.recoveryBonusDelta,
        epidBonus: listingQualityBreakdown.epidBonusDelta,
      },
    },
  };
}

export function buildListingQualityComparisonBlock(
  scores: { epidDisabled: ListingQualityScore; epidEnabled: ListingQualityScore }
): ListingQualityComparison {
  const breakdown = buildBreakdown(scores.epidDisabled, scores.epidEnabled);
  const epidEffectScoreDelta = round4(scores.epidEnabled.finalScore - scores.epidDisabled.finalScore);
  return {
    baseline: scores.epidDisabled,
    compare: scores.epidEnabled,
    epidEffectScoreDelta,
    breakdown,
  };
}
