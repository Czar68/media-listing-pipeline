import type { CanonicalExecutionListing } from "../../contracts/pipelineStageContracts";
import type { ExecutionFailed, ExecutionSuccess } from "../types";

/**
 * Single-item listing executor boundary. Implementations swap without changing batch orchestration.
 */
export interface ListingExecutorPort {
  execute(listing: CanonicalExecutionListing): Promise<ExecutionSuccess | ExecutionFailed>;
}
