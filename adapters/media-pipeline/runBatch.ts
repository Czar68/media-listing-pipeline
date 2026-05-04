import { randomUUID } from "crypto";
import type { ExecutionResult } from "./execution/types";
import { executeListingsWithMockBatchExecutor } from "./execution/batchListingExecution";
import {
  buildExecutionTrace,
  createTraceEvent,
  type ExecutionTrace,
  type ExecutionTraceEvent,
} from "./executionTrace";
import {
  type EpidEnrichedInventoryItem,
} from "./epidEnricher";
import { toEbayInventoryItem, type EbayInventoryItem } from "./ebayMapper";
import { MediaAdapterImpl } from "./mediaAdapter";
import { scanBatchRawItems, type ScanBatchOptions } from "./scanner";
import type { NormalizedInventoryItem, RawScanResult } from "./types";
import type { PublishResult } from "./execution/types";
import {
  validateEnrichedInventoryItem,
  validateExecutionInput,
  validateExecutionResult,
  validateIngestItem,
  validateNormalizedInventoryItem,
} from "./validation/pipelineStageValidators";

/** Temporary: set `MEDIA_PIPELINE_DRY_RUN_TRACE=1` to log execution inputs. */
function dryRunTraceEnabled(): boolean {
  return process.env.MEDIA_PIPELINE_DRY_RUN_TRACE === "1";
}

function dryRunStrategyBasePriceFromMetadata(item: NormalizedInventoryItem): number | undefined {
  const m = item.metadata;
  if (!m || typeof m !== "object") return undefined;
  const listingStrategy = m.listingStrategy as Record<string, unknown> | undefined;
  const pricing = listingStrategy?.pricing as Record<string, unknown> | undefined;
  const basePrice = pricing?.basePrice;
  return typeof basePrice === "number" && Number.isFinite(basePrice) ? basePrice : undefined;
}

function dryRunPayloadListPrice(payload: EbayInventoryItem): number | undefined {
  const p = payload as EbayInventoryItem & {
    price?: number | { value?: string | number };
    listingPrice?: number;
  };
  if (typeof p.price === "number" && Number.isFinite(p.price)) {
    return p.price;
  }
  if (p.price && typeof p.price === "object" && "value" in p.price) {
    const v = (p.price as { value?: string | number }).value;
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (typeof n === "number" && Number.isFinite(n)) {
      return n;
    }
  }
  if (typeof p.listingPrice === "number" && Number.isFinite(p.listingPrice)) {
    return p.listingPrice;
  }
  return undefined;
}

function logDryRunExecutionInputs(
  normalizedInventoryItems: readonly NormalizedInventoryItem[],
  enrichedInventoryItems: readonly EpidEnrichedInventoryItem[],
  canonicalBindingBySku: ReadonlyMap<string, CanonicalRunBinding>
): void {
  if (!dryRunTraceEnabled()) return;
  console.log("[DRY_RUN_EXECUTION_TRACE] --- Execution inputs (runBatch) ---");
  const bySku = new Map(enrichedInventoryItems.map((row) => [String(row.sku), row]));
  for (const row of normalizedInventoryItems) {
    const sku = String(row.sku);
    const binding = canonicalBindingBySku.get(sku);
    const enriched = bySku.get(sku);
    if (enriched === undefined) {
      console.log(
        JSON.stringify({
          phase: "execution_input",
          sku,
          epidSentToExecution: null,
          payloadListPrice: null,
          strategyBasePriceFromMetadata: dryRunStrategyBasePriceFromMetadata(row),
          executionSkipped: true,
          bindingStatus: binding?.status ?? "NO_BINDING",
        })
      );
      continue;
    }
    let payloadList: number | undefined;
    try {
      const payload = toEbayInventoryItem(enriched);
      payloadList = dryRunPayloadListPrice(payload);
    } catch {
      payloadList = undefined;
    }
    const epi = enriched as NormalizedInventoryItem & Partial<EpidEnrichedInventoryItem>;
    console.log(
      JSON.stringify({
        phase: "execution_input",
        sku,
        epidSentToExecution: epi.epid ?? null,
        payloadListPrice: payloadList ?? null,
        strategyBasePriceFromMetadata: dryRunStrategyBasePriceFromMetadata(enriched),
        executionSkipped: false,
        bindingStatus: binding?.status ?? "NO_BINDING",
      })
    );
  }
}

/**
 * Single pipeline contract: scan → normalize → EPID enrichment (optional) → map+execute.
 */
export type RunBatchResult = {
  readonly rawScanResults: RawScanResult[];
  readonly normalizedInventoryItems: NormalizedInventoryItem[];
  readonly enrichedInventoryItems: EpidEnrichedInventoryItem[];
  readonly execution: ExecutionResult;
};

export type RunBatchListingRow = {
  readonly sku: string;
  readonly title: string;
  readonly offerId: string;
  readonly listingId?: string;
  readonly publishStatus: PublishResult["status"];
};

export type RunBatchFailureRow = {
  readonly sku: string;
  readonly message: string;
};

export type RunBatchMockSummary = {
  readonly success: boolean;
  readonly listings: readonly RunBatchListingRow[];
  readonly failures: readonly RunBatchFailureRow[];
  readonly mode: "mock";
};

function buildRunBatchMockSummary(execution: ExecutionResult): RunBatchMockSummary {
  const listings: RunBatchListingRow[] = [...execution.success]
    .sort((a, b) => String(a.item.sku).localeCompare(String(b.item.sku)))
    .map((s) => ({
      sku: String(s.item.sku),
      title: s.item.title,
      offerId: s.publishResult.offerId,
      ...(s.publishResult.listingId !== undefined ? { listingId: s.publishResult.listingId } : {}),
      publishStatus: s.publishResult.status,
    }));
  const failures: RunBatchFailureRow[] = [...execution.failed]
    .sort((a, b) => String(a.item.sku).localeCompare(String(b.item.sku)))
    .map((f) => ({
      sku: String(f.item.sku),
      message: f.error.message,
    }));
  return {
    success: failures.length === 0,
    listings,
    failures,
    mode: "mock",
  };
}

/** {@link RunBatchResult} plus aggregated {@link ExecutionTrace} for orchestration observability. */
export type RunBatchWithTraceResult = RunBatchResult & {
  readonly trace: ExecutionTrace;
  /** Flat copy of {@link ExecutionTrace.events} for run artifacts / CLI persistence. */
  readonly executionTrace: readonly ExecutionTraceEvent[];
} & RunBatchMockSummary;

export interface CanonicalRunBinding {
  readonly canonicalEpid: string;
  readonly status: "RESOLVED" | "UNRESOLVED_BLOCKED";
}

function isCanonicalBindingMap(
  value: unknown
): value is ReadonlyMap<string, CanonicalRunBinding> {
  return value instanceof Map;
}

/**
 * Emits one TRACE_PUBLISH event per item that reached the publish step.
 * Covers both successful publishes (on ExecutionSuccess) and failed publishes
 * (on ExecutionFailed where publishResult is present).
 * Sorted by SKU for deterministic trace ordering.
 */
function appendPublishTraceEvents(
  runId: string,
  execution: ExecutionResult,
  events: ExecutionTraceEvent[]
): void {
  type PublishRow = { sku: unknown; publishResult: PublishResult };
  const rows: PublishRow[] = [];

  for (const s of execution.success) {
    rows.push({ sku: s.item.sku, publishResult: s.publishResult });
  }
  for (const f of execution.failed) {
    if (f.publishResult !== undefined) {
      rows.push({ sku: f.item.sku, publishResult: f.publishResult });
    }
  }

  rows.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));

  for (const { sku, publishResult } of rows) {
    events.push(
      createTraceEvent("TRACE_PUBLISH", runId, {
        sku,
        offerId: publishResult.offerId,
        publishStatus: publishResult.status,
        httpStatus: publishResult.httpStatus,
        ...(publishResult.listingId !== undefined ? { listingId: publishResult.listingId } : {}),
        ...(publishResult.errorCode !== undefined ? { errorCode: publishResult.errorCode } : {}),
        ...(publishResult.errorMessage !== undefined ? { errorMessage: publishResult.errorMessage } : {}),
      })
    );
  }
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
 * Strict order: scan → normalize → canonical EPID projection → mock-only batch execution layer.
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
  for (const raw of rawScanResults) {
    validateIngestItem(raw);
  }
  events.push(
    createTraceEvent("TRACE_SCAN", runId, {
      rawCount: rawScanResults.length,
    })
  );

  const normalizedInventoryItems: NormalizedInventoryItem[] = [];
  for (const raw of rawScanResults) {
    validateIngestItem(raw);
    const normalized = adapter.normalize(raw);
    validateNormalizedInventoryItem(normalized);
    normalizedInventoryItems.push(normalized);
  }
  events.push(
    createTraceEvent("TRACE_NORMALIZE", runId, {
      normalizedCount: normalizedInventoryItems.length,
    })
  );
  for (const row of normalizedInventoryItems) {
    validateNormalizedInventoryItem(row);
  }

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

  for (const row of enrichedInventoryItems) {
    validateEnrichedInventoryItem(row);
  }

  for (const row of enrichedInventoryItems) {
    const listing = toEbayInventoryItem(row);
    validateExecutionInput({ item: row, listing });
  }

  if (canonicalBindingBySku !== null) {
    logDryRunExecutionInputs(
      normalizedInventoryItems,
      enrichedInventoryItems,
      canonicalBindingBySku
    );
  }

  events.push(
    createTraceEvent("TRACE_EXECUTE", runId, {
      executionMode: "mock",
      itemCount: enrichedInventoryItems.length,
    })
  );

  const execution: ExecutionResult = await executeListingsWithMockBatchExecutor(enrichedInventoryItems);

  validateExecutionResult(execution);

  const mockSummary = buildRunBatchMockSummary(execution);

  appendPublishTraceEvents(runId, execution, events);
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
    executionTrace: trace.events,
    ...mockSummary,
  };
}
