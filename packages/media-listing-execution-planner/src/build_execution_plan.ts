import type { ExecutionPlanInput, ExecutionPlanResult, PlanSummary, PlannedAction, SkippedAction, SkippedActionReason } from './types';

/** One pipeline composition yields one logical listing row in the plan. */
const PIPELINE_LISTING_REFERENCE_INDEX = 0;

function planSummaryFor(publishable: boolean): PlanSummary {
  return {
    totalListings: 1,
    publishableListings: publishable ? 1 : 0,
    skippedListings: publishable ? 0 : 1,
  };
}

function skipReasonFromCoreIdentity(
  outcome: ExecutionPlanInput['coreIdentity']['resolution']['outcome'],
): SkippedActionReason | null {
  if (outcome === 'RESOLVED') {
    return null;
  }
  if (outcome === 'CONFLICT') {
    return 'IDENTITY_CONFLICT';
  }
  return 'IDENTITY_UNRESOLVED';
}

function skipReasonFromIdentityApplication(
  outcome: ExecutionPlanInput['identityApplication']['outcome'],
): SkippedActionReason | null {
  if (outcome === 'RESOLVED') {
    return null;
  }
  if (outcome === 'CONFLICT') {
    return 'IDENTITY_CONFLICT';
  }
  return 'IDENTITY_UNRESOLVED';
}

/**
 * Deterministic, pure projection: what would be executed for publication, without performing it.
 */
export function buildExecutionPlan(input: ExecutionPlanInput): ExecutionPlanResult {
  if (input.listingOutput == null || input.publicationRequest == null) {
    const skipped: SkippedAction = {
      reason: 'MISSING_REQUIRED_FIELD',
      reference: PIPELINE_LISTING_REFERENCE_INDEX,
    };
    return {
      planSummary: planSummaryFor(false),
      plannedActions: [],
      skippedActions: [skipped],
    };
  }

  const coreSkip = skipReasonFromCoreIdentity(input.coreIdentity.resolution.outcome);
  if (coreSkip !== null) {
    const skipped: SkippedAction = {
      reason: coreSkip,
      reference: PIPELINE_LISTING_REFERENCE_INDEX,
    };
    return {
      planSummary: planSummaryFor(false),
      plannedActions: [],
      skippedActions: [skipped],
    };
  }

  const applicationSkip = skipReasonFromIdentityApplication(input.identityApplication.outcome);
  if (applicationSkip !== null) {
    const skipped: SkippedAction = {
      reason: applicationSkip,
      reference: PIPELINE_LISTING_REFERENCE_INDEX,
    };
    return {
      planSummary: planSummaryFor(false),
      plannedActions: [],
      skippedActions: [skipped],
    };
  }

  const publish: PlannedAction = {
    type: 'PUBLISH_LISTING',
    source: 'publication-request',
    reference: PIPELINE_LISTING_REFERENCE_INDEX,
  };

  return {
    planSummary: planSummaryFor(true),
    plannedActions: [publish],
    skippedActions: [],
  };
}
