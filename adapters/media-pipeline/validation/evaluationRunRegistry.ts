import { createHash } from "crypto";
import { stableStringify } from "./jsonStable";

export type EvaluationEpidMode = "disabled" | "enabled" | "n/a";
export type EvaluationExecutionMode = "mock" | "sandbox";

export interface EvaluationRunPhaseSnapshot {
  readonly label: "epid_disabled" | "epid_enabled" | "ebay_adversarial";
  readonly epidMode: EvaluationEpidMode;
  readonly executionMode: EvaluationExecutionMode;
}

export interface EvaluationRunRecord {
  readonly runId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly contentHash: string;
  readonly timestamp: string;
  readonly phases: readonly EvaluationRunPhaseSnapshot[];
  readonly runFingerprint: string;
}

const runs: EvaluationRunRecord[] = [];

function byDatasetId(datasetId: string): EvaluationRunRecord[] {
  return runs.filter((r) => r.datasetId === datasetId);
}

/**
 * Append-only in-process history of validation invocations (JSON-serializable records).
 */
export const EvaluationRunRegistry = {
  record(run: EvaluationRunRecord): void {
    runs.push(run);
  },

  findByDatasetId(datasetId: string): readonly EvaluationRunRecord[] {
    return [...byDatasetId(datasetId)].sort((a, b) => a.timestamp.localeCompare(b.timestamp, "en"));
  },

  listAll(): readonly EvaluationRunRecord[] {
    return [...runs];
  },

  /** Test / process isolation only. */
  clear(): void {
    runs.length = 0;
  },
};

/** Executor retry is not env-configurable here; pinned for fingerprint stability. */
export const EXECUTOR_RETRY_POLICY_LABEL = "ebay-executor-default";

export interface RunFingerprintInput {
  readonly phases: readonly EvaluationRunPhaseSnapshot[];
  readonly executorRetryPolicy: string;
}

export function computeRunFingerprint(input: RunFingerprintInput): string {
  const canonical = stableStringify({
    executorRetryPolicy: input.executorRetryPolicy,
    phases: input.phases,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function defaultAdversarialRunPhases(): readonly EvaluationRunPhaseSnapshot[] {
  return [
    { label: "epid_disabled", epidMode: "disabled", executionMode: "mock" },
    { label: "epid_enabled", epidMode: "enabled", executionMode: "mock" },
    { label: "ebay_adversarial", epidMode: "n/a", executionMode: "sandbox" },
  ];
}
