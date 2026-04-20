import type { NormalizedInventoryItem } from '../types';
import type { EbayInventoryItem } from '../ebayMapper';

/**
 * Strict execution result contract shared by all executors
 * Ensures MockExecutor and EbayExecutor produce identical shapes
 */

export type ErrorType = 
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'SANDBOX_LIMITATION'
  | 'RATE_LIMIT'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface ExecutionError {
  type: ErrorType;
  message: string;
  code?: string | number;
  raw?: unknown;
}

export interface ExecutionSuccess {
  item: NormalizedInventoryItem;
  ebayPayload: EbayInventoryItem;
  response: {
    status?: number;
    data?: unknown;
  };
  recovered?: boolean;
  retryCount?: number;
}

export interface ExecutionFailed {
  item: NormalizedInventoryItem;
  ebayPayload: EbayInventoryItem;
  error: ExecutionError;
  recovered?: boolean;
  retryCount?: number;
}

export interface ExecutionResult {
  success: ExecutionSuccess[];
  failed: ExecutionFailed[];
}
