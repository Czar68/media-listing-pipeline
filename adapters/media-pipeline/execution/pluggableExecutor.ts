import type { CanonicalExecutionListing } from "../contracts/pipelineStageContracts";
import type { ListingExecutorPort } from "./ports/listingExecutorPort";
import { MockExecutor } from "./mockExecutor";
import { EbayExecutor } from "./ebayExecutor";

/**
 * Selects single-item executor from {@link process.env.EXECUTION_MODE}.
 * Only this module performs executor routing — no duplicate decision paths elsewhere.
 *
 * Routing:
 * - `sandbox` → {@link EbayExecutor}
 * - `production` → always throws before any ListingExecutor runs
 * - default / unknown → {@link MockExecutor}
 */
export function resolveListingExecutorPort(): ListingExecutorPort {
  const mode = process.env.EXECUTION_MODE?.trim().toLowerCase() ?? "";
  if (mode === "production") {
    throw new Error(
      "PluggableListingExecutor: production EXECUTION_MODE is blocked at executor boundary"
    );
  }
  if (mode === "sandbox") {
    return new EbayExecutor();
  }
  return new MockExecutor();
}
