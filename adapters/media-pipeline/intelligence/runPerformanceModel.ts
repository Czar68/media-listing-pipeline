import type { FinalListingRecord } from "../finalization/finalListingRecord";

const EPS = 1e-9;

/**
 * Groups persisted records by traceRunId. Key order in the map follows insertion order of sorted traceRunIds.
 */
export function groupRecordsByRunId(
  records: readonly FinalListingRecord[]
): ReadonlyMap<string, FinalListingRecord[]> {
  const m = new Map<string, FinalListingRecord[]>();
  const sorted = [...records].sort((a, b) => a.traceRunId.localeCompare(b.traceRunId, "en"));
  for (const r of sorted) {
    const id = r.traceRunId;
    const list = m.get(id);
    if (list === undefined) {
      m.set(id, [r]);
    } else {
      list.push(r);
    }
  }
  return m;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export interface RunPerformanceModel {
  /** Same as {@link FinalListingRecord.traceRunId} for this run. */
  readonly runId: string;
  readonly totalItems: number;
  /** 0–1 */
  readonly successRate: number;
  readonly totalEstimatedProfit: number;
  readonly averagePrice: number;
  /** 0–1, share of rows with non-empty EPID */
  readonly epidCoverageRate: number;
  /** Deterministic key order: sorted strategyId ascending */
  readonly strategyDistribution: Readonly<Record<string, number>>;
  /** 0–1, share of rows with {@link FinalListingRecord.executionResult.recovered} === true */
  readonly recoveryRate: number;
  /** Counts per error type for failed rows; "__none__" if no error payload */
  readonly errorTypeDistribution: Readonly<Record<string, number>>;
  /** Sum(profit) / sum(recommendedPrice); 0 if denominator 0 */
  readonly pricingEfficiencyScore: number;
}

export interface RunComparison {
  readonly delta: {
    readonly totalEstimatedProfit: number;
    readonly successRate: number;
    readonly pricingEfficiencyScore: number;
  };
  readonly winners: {
    readonly totalEstimatedProfit: MetricWinner;
    readonly successRate: MetricWinner;
    readonly pricingEfficiencyScore: MetricWinner;
  };
  readonly overallWinner: MetricWinner;
}

export type MetricWinner = "a" | "b" | "tie";

/**
 * Aggregates persisted {@link FinalListingRecord} rows for a single run.
 * Deterministic: stable sort keys, fixed rounding.
 * @throws if rows reference more than one traceRunId
 */
export function computeRunPerformance(
  records: readonly FinalListingRecord[]
): RunPerformanceModel {
  if (records.length === 0) {
    return {
      runId: "",
      totalItems: 0,
      successRate: 0,
      totalEstimatedProfit: 0,
      averagePrice: 0,
      epidCoverageRate: 0,
      strategyDistribution: {},
      recoveryRate: 0,
      errorTypeDistribution: {},
      pricingEfficiencyScore: 0,
    };
  }

  const runIds = new Set(records.map((r) => r.traceRunId));
  if (runIds.size !== 1) {
    throw new Error(
      `computeRunPerformance: expected single traceRunId, got ${[...runIds].sort().join(", ")}`
    );
  }
  const runId = records[0]!.traceRunId;

  const totalItems = records.length;
  let successCount = 0;
  let recoveredCount = 0;
  let epidCount = 0;
  let totalProfit = 0;
  let sumRecommendedPrice = 0;
  const strategyCounts: Record<string, number> = {};
  const errorCounts: Record<string, number> = {};

  const sorted = [...records].sort((x, y) => x.sku.localeCompare(y.sku, "en"));

  for (const r of sorted) {
    if (r.executionResult.status === "success") {
      successCount += 1;
    }
    if (r.executionResult.recovered === true) {
      recoveredCount += 1;
    }
    if (r.epid !== undefined && String(r.epid).trim() !== "") {
      epidCount += 1;
    }
    totalProfit += r.profitModel.estimatedProfit;
    sumRecommendedPrice += r.listingDecision.recommendedPrice;

    const sid = r.strategyId;
    strategyCounts[sid] = (strategyCounts[sid] ?? 0) + 1;

    if (r.executionResult.status === "failed") {
      const et =
        r.executionResult.error?.type !== undefined &&
        String(r.executionResult.error.type).length > 0
          ? String(r.executionResult.error.type)
          : "__none__";
      errorCounts[et] = (errorCounts[et] ?? 0) + 1;
    }
  }

  const strategyDistribution: Record<string, number> = {};
  for (const k of Object.keys(strategyCounts).sort((a, b) => a.localeCompare(b, "en"))) {
    strategyDistribution[k] = strategyCounts[k]!;
  }

  const errorTypeDistribution: Record<string, number> = {};
  for (const k of Object.keys(errorCounts).sort((a, b) => a.localeCompare(b, "en"))) {
    errorTypeDistribution[k] = errorCounts[k]!;
  }

  const successRate = totalItems > 0 ? successCount / totalItems : 0;
  const epidCoverageRate = totalItems > 0 ? epidCount / totalItems : 0;
  const recoveryRate = totalItems > 0 ? recoveredCount / totalItems : 0;
  const averagePrice = totalItems > 0 ? sumRecommendedPrice / totalItems : 0;
  const pricingEfficiencyScore =
    sumRecommendedPrice > EPS ? totalProfit / sumRecommendedPrice : 0;

  return {
    runId,
    totalItems,
    successRate: round6(successRate),
    totalEstimatedProfit: round2(totalProfit),
    averagePrice: round2(averagePrice),
    epidCoverageRate: round6(epidCoverageRate),
    strategyDistribution,
    recoveryRate: round6(recoveryRate),
    errorTypeDistribution,
    pricingEfficiencyScore: round6(pricingEfficiencyScore),
  };
}

function winnerForMetric(a: number, b: number): MetricWinner {
  if (Math.abs(a - b) < EPS) {
    return "tie";
  }
  return a > b ? "a" : "b";
}

function overallWinnerLex(a: RunPerformanceModel, b: RunPerformanceModel): MetricWinner {
  if (Math.abs(a.totalEstimatedProfit - b.totalEstimatedProfit) >= EPS) {
    return a.totalEstimatedProfit > b.totalEstimatedProfit ? "a" : "b";
  }
  if (Math.abs(a.pricingEfficiencyScore - b.pricingEfficiencyScore) >= EPS) {
    return a.pricingEfficiencyScore > b.pricingEfficiencyScore ? "a" : "b";
  }
  if (Math.abs(a.successRate - b.successRate) >= EPS) {
    return a.successRate > b.successRate ? "a" : "b";
  }
  return "tie";
}

/**
 * Compares two run-level aggregates. Delta is `a - b` for each numeric metric.
 */
export function compareRuns(a: RunPerformanceModel, b: RunPerformanceModel): RunComparison {
  return {
    delta: {
      totalEstimatedProfit: round2(a.totalEstimatedProfit - b.totalEstimatedProfit),
      successRate: round6(a.successRate - b.successRate),
      pricingEfficiencyScore: round6(a.pricingEfficiencyScore - b.pricingEfficiencyScore),
    },
    winners: {
      totalEstimatedProfit: winnerForMetric(a.totalEstimatedProfit, b.totalEstimatedProfit),
      successRate: winnerForMetric(a.successRate, b.successRate),
      pricingEfficiencyScore: winnerForMetric(
        a.pricingEfficiencyScore,
        b.pricingEfficiencyScore
      ),
    },
    overallWinner: overallWinnerLex(a, b),
  };
}
