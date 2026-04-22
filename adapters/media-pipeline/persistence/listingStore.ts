import { promises as fs } from "fs";
import { join } from "path";
import type { FinalListingRecord } from "../finalization/finalListingRecord";

export type { FinalListingRecord } from "../finalization/finalListingRecord";

export interface PersistListingRecordsInput {
  readonly records: readonly FinalListingRecord[];
}

const DATA_DIR = "./data";
const LISTING_RECORDS_FILE = "listing-records.json";

/**
 * Read-only load of persisted listing records (analytics / intelligence). Does not mutate the file.
 */
export async function loadPersistedListingRecords(): Promise<FinalListingRecord[]> {
  try {
    const filePath = join(DATA_DIR, LISTING_RECORDS_FILE);
    const content = await fs.readFile(filePath, "utf-8");
    if (!content.trim()) {
      return [];
    }
    return JSON.parse(content) as FinalListingRecord[];
  } catch {
    return [];
  }
}

/**
 * Persists {@link FinalListingRecord} rows to ./data/listing-records.json in append-only mode.
 * Fails silently on errors (logs warnings only, no crashes).
 */
export async function persistListingRecords(
  input: PersistListingRecordsInput
): Promise<void> {
  try {
    const { records } = input;
    if (records.length === 0) {
      return;
    }

    await fs.mkdir(DATA_DIR, { recursive: true });

    const filePath = join(DATA_DIR, LISTING_RECORDS_FILE);

    let existingRecords: FinalListingRecord[] = [];
    try {
      const existingContent = await fs.readFile(filePath, "utf-8");
      if (existingContent.trim()) {
        existingRecords = JSON.parse(existingContent) as FinalListingRecord[];
      }
    } catch {
      existingRecords = [];
    }

    const updatedRecords = [...existingRecords, ...records];
    await fs.writeFile(filePath, JSON.stringify(updatedRecords, null, 2), "utf-8");
  } catch (error) {
    console.warn(
      `[listingStore] Failed to persist listing records: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
