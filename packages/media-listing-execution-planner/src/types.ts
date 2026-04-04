import type { MediaListingPipelineResult } from '@media-listing/media-listing-pipeline';

/**
 * Planner input: full read-only media listing pipeline result (no execution).
 */
export type ExecutionPlanInput = MediaListingPipelineResult;

export type PlannedActionType = 'PUBLISH_LISTING';

export type PlannedActionSource = 'publication-request';

/**
 * Single planned side-effect boundary (described only; not executed).
 */
export type PlannedAction = {
  readonly type: PlannedActionType;
  readonly source: PlannedActionSource;
  /** Stable index for the listing within this pipeline result (currently a single unit at `0`). */
  readonly reference: number;
};

export type SkippedActionReason =
  | 'MISSING_REQUIRED_FIELD'
  | 'IDENTITY_CONFLICT'
  | 'IDENTITY_UNRESOLVED';

export type SkippedAction = {
  readonly reason: SkippedActionReason;
  readonly reference: number;
};

export type PlanSummary = {
  readonly totalListings: number;
  readonly publishableListings: number;
  readonly skippedListings: number;
};

export type ExecutionPlanResult = {
  readonly planSummary: PlanSummary;
  readonly plannedActions: readonly PlannedAction[];
  readonly skippedActions: readonly SkippedAction[];
};
