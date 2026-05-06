import fs from "fs";
import type { ImageFolder } from "./imageIngest";
import type { CanonicalMarket } from "./types";
import type { PipelineRunCliConfig } from "./cli";
import { runBatch, type CanonicalRunBinding } from "./runBatch";
import type { ExecutionResult } from "./execution/types";
import type { RunArtifact } from "./observability/runArtifactTypes";

export type MediaPipelineInput = {
  readonly markets: readonly CanonicalMarket[];
  readonly imageFolders?: readonly ImageFolder[];
};

export function validateMediaPipelineInput(input: unknown): asserts input is MediaPipelineInput {
  if (input === null || typeof input !== "object") {
    throw new Error("Media pipeline input must be an object");
  }
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o.markets)) {
    throw new Error("Media pipeline input must include a markets array");
  }
  if (o.imageFolders !== undefined && !Array.isArray(o.imageFolders)) {
    throw new Error("Media pipeline input imageFolders must be an array when present");
  }
}

export function runPipeline(input: MediaPipelineInput): {
  pipeline: { markets: CanonicalMarket[] };
} {
  return {
    pipeline: {
      markets: [...input.markets],
    },
  };
}

export type RunPipelineForCliOk = {
  readonly ok: true;
  readonly config: PipelineRunCliConfig;
  readonly result: ExecutionResult;
  readonly runArtifact: RunArtifact;
};

function parseCanonicalBindingRecord(value: unknown): ReadonlyMap<string, CanonicalRunBinding> | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("canonicalBindingBySku must be an object map");
  }
  const m = new Map<string, CanonicalRunBinding>();
  for (const [sku, row] of Object.entries(value as Record<string, unknown>)) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`canonicalBindingBySku["${sku}"] must be an object`);
    }
    const o = row as Record<string, unknown>;
    const canonicalEpid = typeof o.canonicalEpid === "string" ? o.canonicalEpid : "";
    const status: CanonicalRunBinding["status"] =
      o.status === "UNRESOLVED_BLOCKED" ? "UNRESOLVED_BLOCKED" : "RESOLVED";
    m.set(sku, { canonicalEpid, status });
  }
  return m;
}

/**
 * Accepts either a JSON array of batch rows or `{ items, canonicalBindingBySku? }`.
 */
function parseCliBatchInputJson(raw: unknown): {
  readonly items: unknown[];
  readonly canonicalBindingBySku: ReadonlyMap<string, CanonicalRunBinding> | null;
} {
  if (Array.isArray(raw)) {
    return { items: raw, canonicalBindingBySku: null };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Batch input JSON must be an array or an object with an items array");
  }
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.items)) {
    throw new Error('Batch input JSON must include an "items" array when using object form');
  }
  return {
    items: o.items,
    canonicalBindingBySku: parseCanonicalBindingRecord(o.canonicalBindingBySku),
  };
}

function applyCliExecutionMode(config: PipelineRunCliConfig): void {
  const mode = config.mode.trim().toLowerCase();
  if (mode === "sandbox") {
    process.env.EXECUTION_MODE = "sandbox";
    process.env.ENABLE_SANDBOX = "true";
  } else {
    process.env.EXECUTION_MODE = "mock";
    delete process.env.ENABLE_SANDBOX;
  }
}

/**
 * CLI batch path: applies {@link config.mode} to execution env, loads batch JSON from disk,
 * runs {@link runBatch}, returns {@link ExecutionResult} and {@link RunArtifact}.
 */
export async function runPipelineForCliConfig(config: PipelineRunCliConfig): Promise<RunPipelineForCliOk> {
  applyCliExecutionMode(config);
  const rawText = fs.readFileSync(config.input, "utf8");
  const rawJson: unknown = JSON.parse(rawText);
  const { items, canonicalBindingBySku } = parseCliBatchInputJson(rawJson);
  const batchResult =
    canonicalBindingBySku === null
      ? await runBatch(items)
      : await runBatch(items, canonicalBindingBySku);
  const expectedMode = config.mode.trim().toLowerCase() === "sandbox" ? "sandbox" : "mock";
  if (batchResult.execution.mode !== expectedMode) {
    throw new Error(`Pipeline CLI expected execution mode ${expectedMode}`);
  }
  return {
    ok: true,
    config,
    result: batchResult.execution,
    runArtifact: batchResult.runArtifact,
  };
}
