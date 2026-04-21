import type { countErrorTypes, recoveryStats, successFailureRates } from "./aggregateExecutionStats";
import type {
  NormalizedValidationReport,
  ValidationRunComparison,
} from "./normalizeValidationReport";
import type { EvaluationInsights } from "./validationScoringTypes";
import type { EvaluationRunRecord } from "./evaluationRunRegistry";
import type { RegisteredDatasetEntry } from "./validationDatasetRegistry";

/**
 * Raw adversarial validation output (aggregates only, JSON-serializable).
 * Kept separate from normalization to avoid import cycles.
 */
export interface AdversarialValidationReport {
  readonly dataset: {
    readonly itemCount: number;
    readonly fixedCapturedAt: string;
    readonly defaultSource: string;
    readonly datasetId: string;
    readonly datasetVersion: string;
    readonly contentHash: string;
  };
  readonly epidComparison: {
    readonly enrichmentDisabled: {
      readonly tokenPresent: boolean;
      readonly enrichedWithEpidCount: number;
      readonly enrichedWithoutEpidCount: number;
      readonly execution: ReturnType<typeof successFailureRates>;
      readonly errorTypeDistribution: ReturnType<typeof countErrorTypes>;
    };
    readonly enrichmentEnabled: {
      readonly tokenPresent: boolean;
      readonly enrichedWithEpidCount: number;
      readonly enrichedWithoutEpidCount: number;
      readonly execution: ReturnType<typeof successFailureRates>;
      readonly errorTypeDistribution: ReturnType<typeof countErrorTypes>;
    };
    readonly summary: string;
  };
  readonly ebayExecutorAdversarial: {
    readonly executionMode: "ebay";
    readonly successFailureRates: ReturnType<typeof successFailureRates>;
    readonly errorTypeDistribution: ReturnType<typeof countErrorTypes>;
    readonly recovery: ReturnType<typeof recoveryStats>;
    readonly classificationExpectations: {
      readonly passed: number;
      readonly failed: number;
      readonly mismatches: readonly { readonly sku: string; readonly expected: string; readonly actual: string }[];
    };
    readonly recoveryPolicySignals: {
      readonly inventoryPutCountAuthSku: number;
      readonly inventoryPutCountValRetrySku: number;
      readonly valRetrySuccessWithRecoveryFlag: boolean;
      readonly failedRowsWithRetryCount: readonly { readonly sku: string; readonly retryCount: number }[];
      readonly note: string;
    };
  };
}

export interface AdversarialValidationOutput {
  readonly raw: AdversarialValidationReport;
  readonly normalized: NormalizedValidationReport;
  readonly comparison: ValidationRunComparison;
  readonly insights: EvaluationInsights;
  readonly evaluation: {
    readonly run: EvaluationRunRecord;
    readonly registeredDataset: RegisteredDatasetEntry;
  };
}
