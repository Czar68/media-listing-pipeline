import { randomUUID } from "crypto";
import { executeBatchListings, type ExecutionResult } from "./executeBatchListings";
import {
  buildExecutionTrace,
  createTraceEvent,
  type ExecutionTrace,
  type ExecutionTraceEvent,
} from "./executionTrace";
import {
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

export interface CanonicalRunBinding {
  readonly canonicalEpid: string;
  readonly status: "RESOLVED" | "UNRESOLVED_BLOCKED";
}

function isCanonicalBindingMap(
  value: unknown
): value is ReadonlyMap<string, CanonicalRunBinding> {
  return value instanceof Map;
}

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
 * Strict order: scan → normalize → canonical EPID projection → {@link executeBatchListings}.
 */
export async function runBatch(
  items: readonly unknown[],
  canonicalBindingBySku: ReadonlyMap<string, CanonicalRunBinding>,
  scanOptions?: ScanBatchOptions
): Promise<RunBatchWithTraceResult>;
export async function runBatch(
  items: readonly unknown[],
  scanOptions?: ScanBatchOptions
): Promise<RunBatchWithTraceResult>;
export async function runBatch(
  items: readonly unknown[],
  canonicalBindingOrScanOptions?: ReadonlyMap<string, CanonicalRunBinding> | ScanBatchOptions,
  maybeScanOptions?: ScanBatchOptions
): Promise<RunBatchWithTraceResult> {
  const canonicalBindingBySku = isCanonicalBindingMap(canonicalBindingOrScanOptions)
    ? canonicalBindingOrScanOptions
    : null;
  const scanOptions = isCanonicalBindingMap(canonicalBindingOrScanOptions)
    ? maybeScanOptions
    : canonicalBindingOrScanOptions;

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

  const enrichedInventoryItems: EpidEnrichedInventoryItem[] = normalizedInventoryItems.flatMap((row) => {
    if (canonicalBindingBySku === null) {
      return [];
    }
    const binding = canonicalBindingBySku.get(String(row.sku));
    if (
      binding === undefined ||
      binding.status !== "RESOLVED" ||
      String(binding.canonicalEpid).trim() === ""
    ) {
      return [];
    }
    const existing = row as NormalizedInventoryItem & Omit<Partial<EpidEnrichedInventoryItem>, "epid">;
    return [
      {
        ...existing,
        epid: String(binding.canonicalEpid).trim(),
      },
    ];
  });

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
