import { randomUUID } from "crypto";
import { executeBatchListings, type ExecutionResult } from "./executeBatchListings";
import {
  buildExecutionTrace,
  createTraceEvent,
  type ExecutionTrace,
  type ExecutionTraceEvent,
} from "./executionTrace";
import {
  enrichWithEpid,
  type EpidEnrichedInventoryItem,
} from "./epidEnricher";
import { MediaAdapterImpl } from "./mediaAdapter";
import { scanBatchRawItems, type ScanBatchOptions } from "./scanner";
import type { NormalizedInventoryItem, RawScanResult } from "./types";

/**
 * Single pipeline contract: scan → normalize → EPID enrichment (optional) → map+execute.
 */
export type RunBatchResult = {
  readonly rawScanResults: RawScanResult[];
  readonly normalizedInventoryItems: NormalizedInventoryItem[];
  readonly enrichedInventoryItems: EpidEnrichedInventoryItem[];
  readonly execution: ExecutionResult;
};

/** {@link RunBatchResult} plus aggregated {@link ExecutionTrace} for orchestration observability. */
export type RunBatchWithTraceResult = RunBatchResult & { readonly trace: ExecutionTrace };

function executionModeLabel(): "ebay" | "mock" {
  return process.env.EXECUTION_MODE === "ebay" ? "ebay" : "mock";
}

function appendErrorAndRecoveryEvents(
  runId: string,
  execution: ExecutionResult,
  events: ExecutionTraceEvent[]
): void {
  const failedSorted = [...execution.failed].sort((a, b) =>
    String(a.item.sku).localeCompare(String(b.item.sku))
  );
  for (const f of failedSorted) {
    events.push(
      createTraceEvent("TRACE_ERROR", runId, {
        sku: f.item.sku,
        message: f.error.message,
        ...(f.error.type !== undefined ? { errorType: f.error.type } : {}),
      })
    );
  }

  type RecoveryRow = { readonly sku: unknown; readonly phase: "success" | "failed" };
  const recoveryRows: RecoveryRow[] = [];
  for (const s of execution.success) {
    if (s.recovered === true) {
      recoveryRows.push({ sku: s.item.sku, phase: "success" });
    }
  }
  for (const f of execution.failed) {
    if (f.recovered === true) {
      recoveryRows.push({ sku: f.item.sku, phase: "failed" });
    }
  }
  recoveryRows.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
  for (const r of recoveryRows) {
    events.push(
      createTraceEvent("TRACE_RECOVERY", runId, {
        sku: r.sku,
        phase: r.phase,
      })
    );
  }
}

/**
 * Strict order: scan → normalize → {@link enrichWithEpid} (parallel, order-preserving) → {@link executeBatchListings}.
 */
export async function runBatch(
  items: readonly unknown[],
  scanOptions?: ScanBatchOptions
): Promise<RunBatchWithTraceResult> {
  const runId = randomUUID();
  const runStartedAt = new Date().toISOString();
  const events: ExecutionTraceEvent[] = [];

  const adapter = new MediaAdapterImpl();

  const rawScanResults: RawScanResult[] = scanBatchRawItems(items, scanOptions);
  events.push(
    createTraceEvent("TRACE_SCAN", runId, {
      rawCount: rawScanResults.length,
    })
  );

  const normalizedInventoryItems: NormalizedInventoryItem[] = [];
  for (const raw of rawScanResults) {
    normalizedInventoryItems.push(adapter.normalize(raw));
  }
  events.push(
    createTraceEvent("TRACE_NORMALIZE", runId, {
      normalizedCount: normalizedInventoryItems.length,
    })
  );

  const enrichedInventoryItems: EpidEnrichedInventoryItem[] = await Promise.all(
    normalizedInventoryItems.map(async (row) => {
      const existing = row as NormalizedInventoryItem & Partial<EpidEnrichedInventoryItem>;
      if (existing.epid !== undefined && String(existing.epid).trim() !== "") {
        return existing;
      }
      return enrichWithEpid(row);
    })
  );

  events.push(
    createTraceEvent("TRACE_EXECUTE", runId, {
      executionMode: executionModeLabel(),
      itemCount: enrichedInventoryItems.length,
    })
  );

  const execution: ExecutionResult = await executeBatchListings(enrichedInventoryItems);

  appendErrorAndRecoveryEvents(runId, execution, events);

  const trace = buildExecutionTrace({
    runId,
    runStartedAt,
    execution,
    events,
  });

  return {
    rawScanResults,
    normalizedInventoryItems,
    enrichedInventoryItems,
    execution,
    trace,
  };
}
