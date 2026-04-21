import type { ResolvedDatasetIdentity } from "./datasetIdentity";

export interface RegisteredDatasetEntry {
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly contentHash: string;
  /** ISO time when this datasetId was first registered in-process. */
  readonly firstRegisteredAt: string;
}

const byId = new Map<string, RegisteredDatasetEntry>();

/**
 * In-process registry: same content hash always maps to the same `datasetId`;
 * re-registration with mismatched content for an existing id is rejected.
 */
export const ValidationDatasetRegistry = {
  register(identity: ResolvedDatasetIdentity): RegisteredDatasetEntry {
    const existing = byId.get(identity.datasetId);
    if (existing !== undefined) {
      if (existing.contentHash !== identity.contentHash) {
        throw new Error(
          `ValidationDatasetRegistry: datasetId ${identity.datasetId} already bound to a different contentHash`
        );
      }
      return existing;
    }
    const entry: RegisteredDatasetEntry = {
      datasetId: identity.datasetId,
      datasetVersion: identity.datasetVersion,
      contentHash: identity.contentHash,
      firstRegisteredAt: new Date().toISOString(),
    };
    byId.set(identity.datasetId, entry);
    return entry;
  },

  get(datasetId: string): RegisteredDatasetEntry | undefined {
    return byId.get(datasetId);
  },

  /** Sorted for deterministic enumeration. */
  listDatasetIds(): readonly string[] {
    return [...byId.keys()].sort((a, b) => a.localeCompare(b, "en"));
  },

  /** Test / process isolation only. */
  clear(): void {
    byId.clear();
  },
};
