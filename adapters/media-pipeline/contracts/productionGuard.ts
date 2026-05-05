import { createHash } from "crypto";

const STAGE = "production_guard" as const;

export type ProductionUnlockConfig = {
  allowProduction: boolean;
  confirmationToken: string;
};

export function readProductionUnlockConfigFromEnv(): ProductionUnlockConfig {
  return {
    allowProduction: process.env.ENABLE_PRODUCTION === "true",
    confirmationToken: String(process.env.PRODUCTION_CONFIRMATION_TOKEN ?? "").trim(),
  };
}

/** Deterministic expected token: `sha256(runId + executionBatchId)` (hex). */
export function expectedProductionConfirmationToken(runId: string, executionBatchId: string): string {
  return createHash("sha256").update(`${runId}${executionBatchId}`, "utf8").digest("hex");
}

/**
 * Thrown when a production execution path is evaluated; execution never proceeds in Phase 7.
 * Shape: `{ stage: "production_guard", error, blocked: true, mode: "production" }` via {@link toStructured}.
 */
export class ProductionGuardError extends Error {
  readonly stage = STAGE;
  readonly blocked = true as const;
  readonly mode = "production" as const;
  /**
   * Events collected through the production guard (ends with `TRACE_PRODUCTION_BLOCK`).
   * Set by `runBatch` when the guard aborts.
   */
  partialExecutionTrace?: readonly unknown[];

  constructor(message: string) {
    super(message);
    this.name = "ProductionGuardError";
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toStructured(): {
    stage: typeof STAGE;
    error: string;
    mode: "production";
    blocked: boolean;
  } {
    return {
      stage: this.stage,
      error: this.message,
      mode: "production",
      blocked: true,
    };
  }
}

export type ProductionBlockTracePush = (reason: string, attempted: boolean) => void;

/**
 * Validates production unlock preconditions, emits a single `TRACE_PRODUCTION_BLOCK`, then always throws.
 * Does not enable or invoke real production execution.
 */
export function gateProductionExecutionAttemptBlocked(params: {
  readonly runId: string;
  readonly executionBatchId: string;
  readonly pushProductionBlockTrace: ProductionBlockTracePush;
}): never {
  const { runId, executionBatchId, pushProductionBlockTrace } = params;
  const config = readProductionUnlockConfigFromEnv();

  if (!config.allowProduction) {
    pushProductionBlockTrace("production_guard_blocked: ENABLE_PRODUCTION must be true", false);
    throw new ProductionGuardError("production_guard_blocked: ENABLE_PRODUCTION must be true");
  }
  if (config.confirmationToken.length === 0) {
    pushProductionBlockTrace("production_guard_blocked: PRODUCTION_CONFIRMATION_TOKEN is required", false);
    throw new ProductionGuardError("production_guard_blocked: PRODUCTION_CONFIRMATION_TOKEN is required");
  }
  const expected = expectedProductionConfirmationToken(runId, executionBatchId);
  if (config.confirmationToken !== expected) {
    pushProductionBlockTrace("production_guard_blocked: confirmation token mismatch", false);
    throw new ProductionGuardError("production_guard_blocked: confirmation token mismatch");
  }

  pushProductionBlockTrace("production execution disabled in Phase 7", true);
  throw new ProductionGuardError("production execution disabled in Phase 7");
}
