import type { IdentityRegionCode } from '../model/identity-candidate';
import type { IdentityCandidateSet } from '../model/identity-candidate-set';
import type { IdentityConflict } from '../model/identity-conflict';
import type { IdentityResolutionResult } from '../model/identity-resolution-result';
import { computeDeterministicSnapshotId } from '../model/identity-snapshot';
import type { ResolvedIdentity } from '../model/resolved-identity';
import type { IdentitySnapshot } from '../model/identity-snapshot';
import { validateIdentityStructureForCandidateSet } from '../validators/validate-identity-structure';

/**
 * Explicit observed facts for alignment checks — supplied by callers; never inferred here.
 */
export interface IdentityAlignmentProbe {
  readonly observedDiscSlotCount: number;
  readonly observedRegionCode: IdentityRegionCode;
  readonly discSlots?: readonly {
    readonly slotIndex: number;
    readonly catalogFingerprint: string;
    readonly observedFingerprint: string;
  }[];
}

export interface ResolveIdentityInput {
  readonly candidateSet: IdentityCandidateSet;
  readonly selectedCandidateId: string | undefined;
  readonly operatorId: string;
  readonly rationale: string | undefined;
  readonly resolvedAt: string;
  readonly alignment: IdentityAlignmentProbe;
}

function detectAlignmentConflictsForCandidate(
  candidate: import('../model/identity-candidate').IdentityCandidate,
  alignment: IdentityAlignmentProbe,
): readonly IdentityConflict[] {
  const conflicts: IdentityConflict[] = [];

  if (candidate.discCount !== alignment.observedDiscSlotCount) {
    conflicts.push({
      kind: 'MISMATCHED_DISC',
      expectedDiscCount: candidate.discCount,
      observedDiscCount: alignment.observedDiscSlotCount,
    });
  }

  if (candidate.region !== alignment.observedRegionCode) {
    conflicts.push({
      kind: 'REGION_CONFLICT',
      catalogRegion: candidate.region,
      observedRegion: alignment.observedRegionCode,
    });
  }

  const slots = alignment.discSlots;
  if (slots !== undefined) {
    for (const slot of slots) {
      if (slot.catalogFingerprint !== slot.observedFingerprint) {
        conflicts.push({
          kind: 'MISMATCHED_DISC',
          expectedDiscCount: candidate.discCount,
          observedDiscCount: alignment.observedDiscSlotCount,
          slotIndex: slot.slotIndex,
          catalogFingerprint: slot.catalogFingerprint,
          observedFingerprint: slot.observedFingerprint,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Deterministic identity resolution: confidence is ignored; no silent selection.
 */
export function resolveIdentity(input: ResolveIdentityInput): IdentityResolutionResult {
  const structure = validateIdentityStructureForCandidateSet(input.candidateSet);
  if (!structure.ok) {
    return {
      outcome: 'CONFLICT',
      conflicts: [{ kind: 'INSUFFICIENT_DATA', reason: 'INVALID_STRUCTURE' }],
    };
  }

  const { candidates } = input.candidateSet;

  if (candidates.length === 0) {
    return { outcome: 'RESEARCH_REQUIRED' };
  }

  if (input.selectedCandidateId === undefined) {
    if (candidates.length > 1) {
      return {
        outcome: 'CONFLICT',
        conflicts: [
          {
            kind: 'MULTI_MATCH_AMBIGUITY',
            orderedCandidateIds: candidates.map((c) => c.candidateId),
          },
        ],
      };
    }
    return {
      outcome: 'CONFLICT',
      conflicts: [{ kind: 'INSUFFICIENT_DATA', reason: 'SELECTION_REQUIRED' }],
    };
  }

  const selected = candidates.find((c) => c.candidateId === input.selectedCandidateId);
  if (selected === undefined) {
    return {
      outcome: 'CONFLICT',
      conflicts: [{ kind: 'INSUFFICIENT_DATA', reason: 'UNKNOWN_SELECTED_ID' }],
    };
  }

  const alignmentConflicts = detectAlignmentConflictsForCandidate(selected, input.alignment);
  if (alignmentConflicts.length > 0) {
    return { outcome: 'CONFLICT', conflicts: alignmentConflicts };
  }

  const resolved: ResolvedIdentity = {
    selectedCandidateId: selected.candidateId,
    decisionSource: 'MANUAL',
    timestamp: input.resolvedAt,
    operatorId: input.operatorId,
    rationale: input.rationale,
  };

  const snapshot: IdentitySnapshot = {
    snapshotId: computeDeterministicSnapshotId({
      schemaVersion: '1',
      productId: selected.productId,
      candidateId: selected.candidateId,
      timestamp: input.resolvedAt,
      operatorId: input.operatorId,
    }),
    schemaVersion: '1',
    timestamp: input.resolvedAt,
    candidate: selected,
    resolution: resolved,
  };

  return { outcome: 'RESOLVED', resolved, snapshot };
}
