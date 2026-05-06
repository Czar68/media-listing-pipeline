/**
 * Public API: batch execution contracts and observability only.
 * Runtime path: `cli` → `run_pipeline` → `runBatch` → mock-only batch executor → `MockExecutor`.
 */
export type { MediaPipelineInput } from "./run_pipeline";
export { runPipeline, validateMediaPipelineInput } from "./run_pipeline";
export type { RunPipelineForCliOk } from "./run_pipeline";

export type { PipelineRunCliConfig } from "./cli";

export type { CanonicalExecutionListing, ExecutionInput } from "./contracts/pipelineStageContracts";

export type { ExecutionResult } from "./execution/types";
export type { ExecutionMode } from "./contracts/environmentGuard";

export { ProductionGuardError } from "./contracts/productionGuard";

export { buildRunArtifact } from "./observability/buildRunArtifact";
export type { RunArtifact } from "./observability/runArtifactTypes";
