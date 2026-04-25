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

/**
 * Structured outcome of the publish step for a single offer.
 * Always present on ExecutionSuccess; present on ExecutionFailed only when
 * inventory + offer creation succeeded but publishOffer itself failed.
 */
export interface PublishResult {
  readonly offerId: string;
  readonly status: 'PUBLISHED' | 'FAILED';
  readonly httpStatus: number;
  /** eBay marketplace listingId returned by the publish endpoint on success. */
  readonly listingId?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
}

export interface ExecutionSuccess {
  item: NormalizedInventoryItem;
  ebayPayload: EbayInventoryItem;
  response: {
    status?: number;
    data?: unknown;
  };
  /** Structured outcome of the publish step. Always set on success paths. */
  publishResult: PublishResult;
  recovered?: boolean;
  retryCount?: number;
}

export interface ExecutionFailed {
  item: NormalizedInventoryItem;
  ebayPayload: EbayInventoryItem;
  error: ExecutionError;
  /**
   * Present when failure occurred at or after the publish step.
   * Absent when failure occurred during inventory PUT or offer POST.
   */
  publishResult?: PublishResult;
  recovered?: boolean;
  retryCount?: number;
}

export interface ExecutionResult {
  success: ExecutionSuccess[];
  failed: ExecutionFailed[];
}
