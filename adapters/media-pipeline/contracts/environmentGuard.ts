/**
 * Phase 5: hard execution environment gates (mock-default, sandbox opt-in, production blocked).
 */

export type ExecutionMode = "mock" | "sandbox" | "blocked";

/** Modes permitted for successful batch completion (never {@link ExecutionMode} `"blocked"`). */
export type PipelineExecutionPhaseMode = Exclude<ExecutionMode, "blocked">;

const STAGE = "environment_guard" as const;

/**
 * Throws for any disallowed execution environment. Deterministic messages; use {@link EnvironmentGuardError.toStructured} for payloads.
 */
export class EnvironmentGuardError extends Error {
  readonly stage = STAGE;
  readonly blocked = true as const;
  /**
   * Orchestration events collected before the guard aborted (ends with `TRACE_ENV_BLOCK`).
   * Set only by `runBatch` so callers can still observe deterministic trace structure.
   */
  partialExecutionTrace?: readonly unknown[];

  constructor(
    message: string,
    readonly mode: string
  ) {
    super(message);
    this.name = "EnvironmentGuardError";
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toStructured(): { stage: typeof STAGE; error: string; mode: string; blocked: boolean } {
    return {
      stage: this.stage,
      error: this.message,
      mode: this.mode,
      blocked: true,
    };
  }
}

/** Resolves `"mock"` (default) or `"sandbox"` from `EXECUTION_MODE`; any other label throws. */
export function resolvePipelineExecutionPhaseMode(): PipelineExecutionPhaseMode {
  const raw = process.env.EXECUTION_MODE?.trim().toLowerCase() ?? "";
  if (raw === "" || raw === "mock") {
    return "mock";
  }
  if (raw === "sandbox") {
    return "sandbox";
  }
  throw new EnvironmentGuardError(
    "environment_guard_blocked: EXECUTION_MODE must be mock or sandbox",
    raw.length > 0 ? raw : "unknown"
  );
}

/**
 * Validates that the resolved execution phase is permitted in the current process environment.
 *
 * - `mock` — always allowed
 * - `sandbox` — requires `process.env.ENABLE_SANDBOX === "true"`
 * - `blocked` or any other unsupported mode — denied
 */
export function validateExecutionEnvironment(mode: ExecutionMode): void {
  if (mode === "mock") {
    return;
  }
  if (mode === "sandbox") {
    if (process.env.ENABLE_SANDBOX !== "true") {
      throw new EnvironmentGuardError(
        "environment_guard_blocked: sandbox execution requires ENABLE_SANDBOX=true",
        "sandbox"
      );
    }
    return;
  }
  throw new EnvironmentGuardError(
    "environment_guard_blocked: unsupported execution mode",
    mode
  );
}

/**
 * Production API targets are evaluated only via {@link detectProductionIntent} and
 * `productionGuard.gateProductionExecutionAttemptBlocked` in `runBatch` (Phase 7).
 */
export function assertNoProductionExecution(): void {}

/**
 * True when execution is explicitly aimed at production (Phase 7 production readiness gate).
 *
 * Routed through `contracts/productionGuard` — still throws before any batch executor runs.
 */
export function detectProductionIntent(): boolean {
  const raw = process.env.EXECUTION_MODE?.trim().toLowerCase() ?? "";
  if (raw === "production") {
    return true;
  }
  if (process.env.EBAY_ENV?.trim().toLowerCase() === "production") {
    return true;
  }
  return false;
}
