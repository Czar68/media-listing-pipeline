import type { IdentityCandidate } from './identity-candidate';
import type { ResolvedIdentity } from './resolved-identity';

export const IDENTITY_SNAPSHOT_SCHEMA_VERSIONS = ['1'] as const;
export type IdentitySnapshotSchemaVersion = (typeof IDENTITY_SNAPSHOT_SCHEMA_VERSIONS)[number];

/**
 * Immutable point-in-time identity — any identity change requires a new snapshot
 * and invalidates prior snapshots for downstream use.
 */
export interface IdentitySnapshot {
  readonly snapshotId: string;
  readonly schemaVersion: IdentitySnapshotSchemaVersion;
  readonly timestamp: string;
  readonly candidate: IdentityCandidate;
  readonly resolution: ResolvedIdentity;
}

export function computeDeterministicSnapshotId(input: {
  readonly schemaVersion: IdentitySnapshotSchemaVersion;
  readonly productId: string;
  readonly candidateId: string;
  readonly timestamp: string;
  readonly operatorId: string;
}): string {
  return [
    input.schemaVersion,
    input.productId,
    input.candidateId,
    input.timestamp,
    input.operatorId,
  ].join('|');
}
