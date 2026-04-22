import type { RunComparison, RunPerformanceModel } from "../intelligence/runPerformanceModel";

const EPS = 1e-9;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export interface StrategyAdjustmentPolicy {
  readonly adjustedStrategyWeights: Readonly<Record<string, number>>;
  readonly pricingAdjustmentHints: {
    readonly aggressiveMultiplierDelta: number;
    readonly safeMultiplierDelta: number;
  };
  readonly epidAdjustmentHints: {
    readonly epidBonusScaleDelta: number;
    readonly epidRelianceReductionFlag: boolean;
  };
  /** 0–1, higher when more runs and signals align */
  readonly confidenceScore: number;
}

export interface ComputeStrategyAdjustmentPolicyInput {
  readonly runs: readonly RunPerformanceModel[];
  /** Optional pairwise comparisons (newer vs older), same order as {@link ../intelligence/runPerformanceIndex.compareLatestRuns}. */
  readonly pairwiseComparisons?: readonly RunComparison[];
}

export interface RunTrendSnapshot {
  readonly n: number;
  /** Newest-first slice used */
  readonly runsNewestFirst: readonly RunPerformanceModel[];
  /** Same runs, oldest → newest */
  readonly runsChronological: readonly RunPerformanceModel[];
  readonly profitSlope: number;
  readonly successRateSlope: number;
  readonly efficiencySlope: number;
}

const WEIGHT_NUDGE = 0.06;
const PRICING_DELTA = 0.025;
const EPID_BONUS_DELTA = 0.04;
const SUCCESS_STABLE_MAX_ABS_SLOPE = 0.035;
const TREND_EPS = 0.0005;
const HIGH_RECOVERY = 0.12;
const LOW_ERROR_RATE = 0.18; // 1 - successRate <= this → "errors low" when success >= 0.82

function linearSlopeY(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) {
    return 0;
  }
  const xMean = (n - 1) / 2;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - xMean;
    sxy += dx * values[i]!;
    sxx += dx * dx;
  }
  return sxx > EPS ? sxy / sxx : 0;
}

/**
 * Uses the last `n` runs from a **newest-first** list (as returned by {@link listRunPerformances}).
 * Slopes are least-squares on chronological order (oldest → newest).
 */
export function compareRunTrend(
  runsNewestFirst: readonly RunPerformanceModel[],
  n: number
): RunTrendSnapshot {
  const take = Math.max(0, Math.min(Math.floor(n), runsNewestFirst.length));
  const slice = runsNewestFirst.slice(0, take);
  const chronological = [...slice].reverse();
  if (chronological.length < 2) {
    return {
      n: chronological.length,
      runsNewestFirst: slice,
      runsChronological: chronological,
      profitSlope: 0,
      successRateSlope: 0,
      efficiencySlope: 0,
    };
  }
  const profit = chronological.map((r) => r.totalEstimatedProfit);
  const sr = chronological.map((r) => r.successRate);
  const eff = chronological.map((r) => r.pricingEfficiencyScore);
  return {
    n: chronological.length,
    runsNewestFirst: slice,
    runsChronological: chronological,
    profitSlope: round6(linearSlopeY(profit)),
    successRateSlope: round6(linearSlopeY(sr)),
    efficiencySlope: round6(linearSlopeY(eff)),
  };
}

function strategyModeFromId(strategyId: string): "aggressive" | "balanced" | "safe" | "unknown" {
  const m = /^listing-strategy-(aggressive|balanced|safe)-v\d+$/i.exec(strategyId.trim());
  if (m?.[1]) {
    return m[1].toLowerCase() as "aggressive" | "balanced" | "safe";
  }
  const s = strategyId.toLowerCase();
  if (s.includes("aggressive")) return "aggressive";
  if (s.includes("safe")) return "safe";
  if (s.includes("balanced")) return "balanced";
  return "unknown";
}

function collectStrategyIds(runs: readonly RunPerformanceModel[]): string[] {
  const set = new Set<string>();
  for (const r of runs) {
    for (const k of Object.keys(r.strategyDistribution)) {
      set.add(k);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "en"));
}

/** Base weights from the latest run (first in newest-first array) — count shares. */
function baseWeightsFromLatestRun(latest: RunPerformanceModel): Record<string, number> {
  const dist = latest.strategyDistribution;
  const keys = Object.keys(dist).sort((a, b) => a.localeCompare(b, "en"));
  const total = keys.reduce((s, k) => s + (dist[k] ?? 0), 0);
  const out: Record<string, number> = {};
  if (total <= EPS) {
    return {};
  }
  for (const k of keys) {
    out[k] = (dist[k] ?? 0) / total;
  }
  return out;
}

function normalizeWeights(w: Record<string, number>): Record<string, number> {
  const keys = Object.keys(w).sort((a, b) => a.localeCompare(b, "en"));
  const sum = keys.reduce((s, k) => s + (w[k] ?? 0), 0);
  if (sum <= EPS) {
    return {};
  }
  const out: Record<string, number> = {};
  for (const k of keys) {
    out[k] = round6((w[k] ?? 0) / sum);
  }
  return out;
}

function equalSplitWeights(ids: readonly string[]): Record<string, number> {
  if (ids.length === 0) {
    return {};
  }
  const v = round6(1 / ids.length);
  const out: Record<string, number> = {};
  for (const id of ids) {
    out[id] = v;
  }
  return out;
}

function pickIdsByMode(
  ids: readonly string[],
  mode: "aggressive" | "balanced" | "safe"
): string[] {
  return ids.filter((id) => strategyModeFromId(id) === mode);
}

/**
 * Deterministic policy from run aggregates and optional pairwise comparisons.
 */
export function computeStrategyAdjustmentPolicy(
  input: ComputeStrategyAdjustmentPolicyInput
): StrategyAdjustmentPolicy {
  const { runs, pairwiseComparisons } = input;
  const runsNewestFirst = [...runs];

  if (runsNewestFirst.length === 0) {
    return {
      adjustedStrategyWeights: {},
      pricingAdjustmentHints: {
        aggressiveMultiplierDelta: 0,
        safeMultiplierDelta: 0,
      },
      epidAdjustmentHints: {
        epidBonusScaleDelta: 0,
        epidRelianceReductionFlag: false,
      },
      confidenceScore: 0,
    };
  }

  const trendWindow =
    runsNewestFirst.length >= 3
      ? Math.min(5, Math.max(3, runsNewestFirst.length))
      : runsNewestFirst.length;
  const trend = compareRunTrend(runsNewestFirst, trendWindow);

  const allIds = collectStrategyIds(runsNewestFirst);
  const latestBase = baseWeightsFromLatestRun(runsNewestFirst[0]!);
  let weights: Record<string, number> =
    Object.keys(latestBase).length > 0 ? { ...latestBase } : equalSplitWeights(allIds);

  if (Object.keys(weights).length === 0) {
    weights = equalSplitWeights(["listing-strategy-balanced-v1"]);
  }

  let aggMul = 0;
  let safeMul = 0;
  let epidBonus = 0;
  let epidRelianceReduce = false;

  const profitUp = trend.profitSlope > TREND_EPS;
  const successStable = Math.abs(trend.successRateSlope) <= SUCCESS_STABLE_MAX_ABS_SLOPE;
  if (profitUp && successStable) {
    const aggressiveIds = pickIdsByMode(Object.keys(weights), "aggressive");
    const safeIds = pickIdsByMode(Object.keys(weights), "safe");
    for (const id of aggressiveIds) {
      weights[id] = (weights[id] ?? 0) + WEIGHT_NUDGE;
    }
    for (const id of safeIds) {
      weights[id] = Math.max(0, (weights[id] ?? 0) - WEIGHT_NUDGE);
    }
    aggMul += PRICING_DELTA;
    safeMul -= PRICING_DELTA;
  }

  const latest = runsNewestFirst[0]!;
  const errorRate = 1 - latest.successRate;
  const recoveryHigh = latest.recoveryRate >= HIGH_RECOVERY;
  const errorsLow = errorRate <= LOW_ERROR_RATE;
  if (recoveryHigh && errorsLow) {
    epidBonus += EPID_BONUS_DELTA;
    epidRelianceReduce = false;
  }

  const efficiencyDown = trend.efficiencySlope < -TREND_EPS;
  if (efficiencyDown) {
    const aggressiveIds = pickIdsByMode(Object.keys(weights), "aggressive");
    const safeIds = pickIdsByMode(Object.keys(weights), "safe");
    for (const id of aggressiveIds) {
      weights[id] = Math.max(0, (weights[id] ?? 0) - WEIGHT_NUDGE);
    }
    for (const id of safeIds) {
      weights[id] = (weights[id] ?? 0) + WEIGHT_NUDGE;
    }
    aggMul -= PRICING_DELTA;
    safeMul += PRICING_DELTA;
  }

  weights = normalizeWeights(weights);

  let confidence =
    runsNewestFirst.length >= 3
      ? 0.45 + 0.11 * Math.min(runsNewestFirst.length, 5)
      : 0.25 + 0.08 * runsNewestFirst.length;
  confidence = Math.min(1, confidence);

  if (pairwiseComparisons !== undefined && pairwiseComparisons.length > 0) {
    const agree =
      pairwiseComparisons.filter((c) => c.winners.totalEstimatedProfit === "a").length /
      pairwiseComparisons.length;
    confidence = round4(Math.min(1, confidence + 0.08 * (agree - 0.5)));
  }

  return {
    adjustedStrategyWeights: weights,
    pricingAdjustmentHints: {
      aggressiveMultiplierDelta: round4(aggMul),
      safeMultiplierDelta: round4(safeMul),
    },
    epidAdjustmentHints: {
      epidBonusScaleDelta: round4(epidBonus),
      epidRelianceReductionFlag: epidRelianceReduce,
    },
    confidenceScore: round4(Math.min(1, Math.max(0, confidence))),
  };
}

export interface PolicyComparison {
  readonly weightDeltas: Readonly<Record<string, number>>;
  readonly pricingHintDeltas: {
    readonly aggressiveMultiplierDelta: number;
    readonly safeMultiplierDelta: number;
  };
  readonly epidHintDeltas: {
    readonly epidBonusScaleDelta: number;
    /** True when the reduction flag differs between policies. */
    readonly epidRelianceReductionChanged: boolean;
  };
  readonly confidenceDelta: number;
}

/**
 * Pure diff between two policies (a − b on numeric fields; flag XOR for boolean).
 */
export function comparePolicyAcrossRuns(
  a: StrategyAdjustmentPolicy,
  b: StrategyAdjustmentPolicy
): PolicyComparison {
  const keys = [...new Set([...Object.keys(a.adjustedStrategyWeights), ...Object.keys(b.adjustedStrategyWeights)])].sort(
    (x, y) => x.localeCompare(y, "en")
  );
  const weightDeltas: Record<string, number> = {};
  for (const k of keys) {
    weightDeltas[k] = round6(
      (a.adjustedStrategyWeights[k] ?? 0) - (b.adjustedStrategyWeights[k] ?? 0)
    );
  }
  return {
    weightDeltas,
    pricingHintDeltas: {
      aggressiveMultiplierDelta: round4(
        a.pricingAdjustmentHints.aggressiveMultiplierDelta -
          b.pricingAdjustmentHints.aggressiveMultiplierDelta
      ),
      safeMultiplierDelta: round4(
        a.pricingAdjustmentHints.safeMultiplierDelta - b.pricingAdjustmentHints.safeMultiplierDelta
      ),
    },
    epidHintDeltas: {
      epidBonusScaleDelta: round4(
        a.epidAdjustmentHints.epidBonusScaleDelta - b.epidAdjustmentHints.epidBonusScaleDelta
      ),
      epidRelianceReductionChanged:
        a.epidAdjustmentHints.epidRelianceReductionFlag !==
        b.epidAdjustmentHints.epidRelianceReductionFlag,
    },
    confidenceDelta: round4(a.confidenceScore - b.confidenceScore),
  };
}
