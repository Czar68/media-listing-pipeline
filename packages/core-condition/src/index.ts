import type {
  ConditionRecord,
  ConditionSignatureEvent,
  IdentityAlignmentInput,
  IdentityConflictReason,
  ValidationFailure,
} from '@media-listing/core-domain';
import { evaluateDiscAuthenticity } from './rules/authenticity-rules';
import {
  collectOverallVersusComponentsFailures,
  collectResurfacedCeilingFailures,
} from './rules/consistency';
import { buildConditionSignatureEvent } from './model/condition-signature';
import { computeCompletenessHash } from './model/completeness-hash';
import { validateConditionSemantics } from './validators/validate-condition-semantics';
import { validateConditionStructure } from './validators/validate-condition-structure';

export type ConditionPipelineOutcome =
  | { readonly outcome: 'SIGNATURE_VALID'; readonly signature: ConditionSignatureEvent }
  | { readonly outcome: 'BLOCKED_AUTHENTICITY'; readonly reason: 'BURNED_DISC' }
  | { readonly outcome: 'IDENTITY_CONFLICT'; readonly reason: IdentityConflictReason }
  | { readonly outcome: 'VALIDATION_FAILED'; readonly failures: readonly ValidationFailure[] };

export { computeCompletenessHash } from './model/completeness-hash';
export { buildConditionSignatureEvent } from './model/condition-signature';
export { validateConditionStructure } from './validators/validate-condition-structure';
export { validateConditionSemantics } from './validators/validate-condition-semantics';
export { evaluateDiscAuthenticity } from './rules/authenticity-rules';
export {
  collectOverallVersusComponentsFailures,
  collectResurfacedCeilingFailures,
} from './rules/consistency';
export * from './standards/grading-standards';
export * from './standards/severity-criteria';
export * from './standards/defect-taxonomy';
export * from './standards/completeness-templates';

export function evaluateIdentityAlignment(
  input: IdentityAlignmentInput,
): IdentityConflictReason | undefined {
  for (const s of input.slots) {
    if (s.catalogFingerprint !== s.observedFingerprint) {
      return 'MISMATCHED_DISC';
    }
  }
  if (input.catalogRegionCode !== input.observedRegionCode) {
    return 'REGION_CONFLICT';
  }
  return undefined;
}

/**
 * Full condition pipeline: identity alignment (optional), structure, authenticity, consistency, semantics, hash, signature.
 * No hidden fallbacks — each gate is explicit.
 */
export function evaluateConditionSignature(params: {
  readonly record: ConditionRecord;
  readonly identityAlignment?: IdentityAlignmentInput;
  readonly signatureId: string;
  readonly createdAtIso: string;
}): ConditionPipelineOutcome {
  const identity = params.identityAlignment
    ? evaluateIdentityAlignment(params.identityAlignment)
    : undefined;
  if (identity) {
    return { outcome: 'IDENTITY_CONFLICT', reason: identity };
  }

  const structural = validateConditionStructure(params.record);
  if (!structural.ok) {
    return { outcome: 'VALIDATION_FAILED', failures: structural.failures };
  }

  for (const c of params.record.components) {
    if (c.kind === 'DISC') {
      const block = evaluateDiscAuthenticity(c);
      if (block) {
        return { outcome: 'BLOCKED_AUTHENTICITY', reason: block };
      }
    }
  }

  const consistencyFailures = [
    ...collectOverallVersusComponentsFailures(params.record),
    ...collectResurfacedCeilingFailures(params.record),
  ];
  if (consistencyFailures.length > 0) {
    return { outcome: 'VALIDATION_FAILED', failures: consistencyFailures };
  }

  const semantic = validateConditionSemantics(params.record);
  if (!semantic.ok) {
    return { outcome: 'VALIDATION_FAILED', failures: semantic.failures };
  }

  const completenessHash = computeCompletenessHash(params.record);
  const signature = buildConditionSignatureEvent({
    signatureId: params.signatureId,
    recordId: params.record.recordId,
    completenessHash,
    createdAtIso: params.createdAtIso,
  });

  return { outcome: 'SIGNATURE_VALID', signature };
}
