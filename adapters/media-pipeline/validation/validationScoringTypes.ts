import type { ErrorType } from "../execution/types";

export interface ListingQualityScore {
  readonly phase: "epid_disabled" | "epid_enabled";
  readonly successWeight: number;
  readonly errorPenalty: number;
  readonly recoveryBonus: number;
  readonly epidBonus: number;
  readonly finalScore: number;
}

export interface ListingQualityBreakdown {
  readonly successWeightDelta: number;
  readonly errorPenaltyDelta: number;
  readonly recoveryBonusDelta: number;
  readonly epidBonusDelta: number;
}

export interface ListingQualityComparison {
  readonly baseline: ListingQualityScore;
  readonly compare: ListingQualityScore;
  readonly epidEffectScoreDelta: number;
  readonly breakdown: ListingQualityBreakdown;
}

export interface EvaluationInsights {
  readonly summaryLines: readonly string[];
  readonly metrics: {
    readonly successRateDelta: number;
    readonly failureRateDelta: number;
    readonly finalScoreDelta: number;
    readonly errorOccurrenceDeltas: Record<ErrorType, number>;
    readonly recoverySuccessesDelta: number;
    readonly outcomeImprovementsWithEpid: number;
    /** Why the listing-quality score changed (EPID-enabled minus EPID-disabled components). */
    readonly componentScoreDeltas: {
      readonly successWeight: number;
      readonly errorPenalty: number;
      readonly recoveryBonus: number;
      readonly epidBonus: number;
    };
  };
}
