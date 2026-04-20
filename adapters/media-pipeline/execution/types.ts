import type { NormalizedInventoryItem } from '../types';
import type { EbayInventoryItem } from '../ebayMapper';

/**
 * Strict execution result contract shared by all executors
 * Ensures MockExecutor and EbayExecutor produce identical shapes
 */

export interface ExecutionError {
  message: string;
  raw?: unknown;
}

export interface ExecutionSuccess {
  item: NormalizedInventoryItem;
  ebayPayload: EbayInventoryItem;
  response: {
    status?: number;
    data?: unknown;
  };
}

export interface ExecutionFailed {
  item: NormalizedInventoryItem;
  ebayPayload: EbayInventoryItem;
  error: ExecutionError;
}

export interface ExecutionResult {
  success: ExecutionSuccess[];
  failed: ExecutionFailed[];
}
