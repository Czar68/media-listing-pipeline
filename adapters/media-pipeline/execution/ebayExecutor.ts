import * as path from 'path';
import type { NormalizedInventoryItem } from '../types';
import type { EbayInventoryItem } from '../ebayMapper';
import { ListingExecutionAdapter } from './executor';
import type { ExecutionSuccess, ExecutionFailed, ExecutionError, ErrorType, PublishResult } from './types';

/**
 * eBay implementation of the listing execution adapter.
 * Handles SINGLE ITEM ONLY — no batch responsibility.
 * Normalizes responses into ExecutionSuccess | ExecutionFailed.
 *
 * Publish verification contract:
 *   publishOffer() never throws. It always returns a PublishResult with status
 *   "PUBLISHED" | "FAILED" and the raw HTTP status code. When publish fails,
 *   executeWithRetry returns ExecutionFailed (not an exception) so the batch
 *   loop always receives a deterministic outcome per item.
 */
export class EbayExecutor implements ListingExecutionAdapter {
  private baseUrl: string;
  private ebayClient: any;

  constructor() {
    const env = process.env.EBAY_ENV || 'sandbox';
    this.baseUrl = env === 'production'
      ? 'https://api.ebay.com'
      : 'https://api.sandbox.ebay.com';

    try {
      const resolved = path.join(__dirname, '..', '..', '..', '..', 'api', 'ebayClient.js');
      this.ebayClient = require(resolved);
    } catch (e) {
      throw new Error(`Failed to load api/ebayClient.js: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async execute(input: {
    item: NormalizedInventoryItem;
    ebayPayload: EbayInventoryItem;
  }): Promise<ExecutionSuccess | ExecutionFailed> {
    const { item, ebayPayload } = input;
    let retryCount = 0;

    try {
      return await this.executeWithRetry(item, ebayPayload, retryCount);
    } catch (err) {
      const error: ExecutionError = this.classifyError(err);

      // Retry only pre-publish failures classified as VALIDATION_ERROR
      if (error.type === 'VALIDATION_ERROR' && retryCount === 0) {
        retryCount++;
        const correctedPayload = this.attemptPayloadCorrection(ebayPayload, error);

        try {
          const result = await this.executeWithRetry(item, correctedPayload, retryCount);
          if ('error' in result) {
            (result as ExecutionFailed).retryCount = retryCount;
          } else {
            (result as ExecutionSuccess).recovered = true;
            (result as ExecutionSuccess).retryCount = retryCount;
          }
          return result;
        } catch (retryErr) {
          return {
            item,
            ebayPayload: correctedPayload,
            error: this.classifyError(retryErr),
            retryCount,
          };
        }
      }

      return { item, ebayPayload, error, retryCount };
    }
  }

  private async executeWithRetry(
    item: NormalizedInventoryItem,
    ebayPayload: EbayInventoryItem,
    retryCount: number
  ): Promise<ExecutionSuccess | ExecutionFailed> {
    // --- Step 1: inventory PUT (throws on error → caught by execute()) ---
    const inventoryBody = this.buildInventoryRequestBody(ebayPayload);
    const response = await this.createInventoryItem(ebayPayload.sku, inventoryBody);

    // --- Step 2: offer POST (throws on error → caught by execute()) ---
    const fulfillmentPolicyId = process.env.EBAY_FULFILLMENT_POLICY_ID?.trim();
    const paymentPolicyId = process.env.EBAY_PAYMENT_POLICY_ID?.trim();
    const returnPolicyId = process.env.EBAY_RETURN_POLICY_ID?.trim();
    const listingPolicies =
      fulfillmentPolicyId && paymentPolicyId && returnPolicyId
        ? {
            fulfillmentPolicyId,
            paymentPolicyId,
            returnPolicyId,
          }
        : undefined;

    const offerBody = {
      sku: ebayPayload.sku,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: 1,
      merchantLocationKey: process.env.EBAY_MERCHANT_LOCATION_KEY,
      categoryId: String(process.env.EBAY_LISTING_CATEGORY_ID ?? '111422').trim(),
      ...(listingPolicies !== undefined ? { listingPolicies } : {}),
      pricingSummary: {
        price: { value: '9.99', currency: 'USD' },
      },
    };

    let offerId: string;
    try {
      const offerResponse = await this.createOffer(offerBody);
      offerId =
        (offerResponse as { data?: { offerId?: string } }).data?.offerId ||
        (offerResponse as { offerId?: string }).offerId ||
        ebayPayload.sku;
    } catch (offerErr: unknown) {
      // Recover offerId when the offer already exists on this SKU
      const err = offerErr as { context?: { bodyPreview?: string } };
      const bodyPreview = err.context?.bodyPreview;
      if (bodyPreview && bodyPreview.includes('already exists')) {
        try {
          const errorBody = JSON.parse(bodyPreview);
          const param = errorBody.errors?.[0]?.parameters?.find(
            (p: { name: string }) => p.name === 'offerId'
          );
          if (param?.value) {
            offerId = param.value;
          } else {
            throw offerErr;
          }
        } catch {
          throw offerErr;
        }
      } else {
        throw offerErr;
      }
    }

    // --- Step 3: publish (never throws — returns PublishResult) ---
    const publishResult = await this.publishOffer(offerId);

    if (publishResult.status === 'FAILED') {
      return {
        item,
        ebayPayload,
        error: {
          type: this.determineErrorType(
            {} as Record<string, unknown>,
            publishResult.httpStatus,
            publishResult.errorMessage ?? ''
          ),
          message: `[PUBLISH_FAILED]: ${publishResult.errorMessage ?? 'publish error'} (HTTP ${publishResult.httpStatus})`,
          code: publishResult.errorCode ?? publishResult.httpStatus,
        },
        publishResult,
        recovered: retryCount > 0,
        retryCount,
      };
    }

    return {
      item,
      ebayPayload,
      response: this.normalizeResponse(response),
      publishResult,
      recovered: retryCount > 0,
      retryCount,
    };
  }

  // ---------------------------------------------------------------------------
  // eBay API calls
  // ---------------------------------------------------------------------------

  private async createInventoryItem(
    sku: string,
    body: Pick<EbayInventoryItem, 'condition' | 'product'>
  ): Promise<unknown> {
    const url = `${this.baseUrl}/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`;
    return this.ebayClient.request({ method: 'PUT', url, body });
  }

  private async createOffer(item: {
    sku: string;
    marketplaceId: string;
    format: string;
    availableQuantity: number;
    merchantLocationKey: string | undefined;
    categoryId: string;
    listingPolicies?: {
      fulfillmentPolicyId: string;
      paymentPolicyId: string;
      returnPolicyId: string;
    };
    pricingSummary: { price: { value: string; currency: string } };
  }): Promise<unknown> {
    const url = `${this.baseUrl}/sell/inventory/v1/offer`;
    return this.ebayClient.request({ method: 'POST', url, body: item });
  }

  /**
   * Publishes an offer and returns a structured PublishResult.
   * This method intentionally does NOT throw — publish failures are surfaced
   * as PublishResult.status = "FAILED" so callers always receive a deterministic
   * outcome rather than an exception.
   */
  private async publishOffer(offerId: string): Promise<PublishResult> {
    const url = `${this.baseUrl}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`;
    try {
      const res = await this.ebayClient.request({ method: 'POST', url });
      const r = res as { status?: number; data?: { listingId?: string } | null };
      const httpStatus = r.status ?? 200;
      const listingId = typeof r.data?.listingId === 'string' && r.data.listingId !== ''
        ? r.data.listingId
        : undefined;
      return { offerId, status: 'PUBLISHED', httpStatus, ...(listingId !== undefined ? { listingId } : {}) };
    } catch (err) {
      const e = err as { statusCode?: number; context?: { bodyPreview?: string } };
      const httpStatus = e.statusCode ?? 0;
      let errorCode: string | undefined;
      let errorMessage: string | undefined;
      try {
        if (e.context?.bodyPreview) {
          const body = JSON.parse(e.context.bodyPreview);
          const firstErr = body.errors?.[0];
          if (firstErr) {
            errorCode = firstErr.errorId !== undefined ? String(firstErr.errorId) : undefined;
            errorMessage = typeof firstErr.message === 'string' ? firstErr.message : undefined;
          }
        }
      } catch {
        // bodyPreview was not valid JSON — leave errorCode/errorMessage undefined
      }
      return {
        offerId,
        status: 'FAILED',
        httpStatus,
        ...(errorCode !== undefined ? { errorCode } : {}),
        ...(errorMessage !== undefined ? { errorMessage } : {}),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Payload builders
  // ---------------------------------------------------------------------------

  /**
   * Builds the inventory item body for PUT /inventory_item/{sku}.
   * Contains only the eBay-documented fields: condition + product.
   * SKU is path-only (not duplicated in body). sourceMetadata is not sent.
   */
  private buildInventoryRequestBody(
    ebayPayload: EbayInventoryItem
  ): Pick<EbayInventoryItem, 'condition' | 'product'> {
    return {
      condition: ebayPayload.condition,
      product: {
        title: ebayPayload.product.title,
        description: ebayPayload.product.description,
        imageUrls: [...ebayPayload.product.imageUrls],
      },
    };
  }

  private normalizeResponse(rawResponse: unknown): { status?: number; data?: unknown } {
    if (rawResponse === null || typeof rawResponse !== 'object') {
      return { data: rawResponse };
    }
    const response = rawResponse as Record<string, unknown>;
    return {
      status: typeof response.status === 'number' ? response.status : undefined,
      data: response.data !== undefined ? response.data : rawResponse,
    };
  }

  // ---------------------------------------------------------------------------
  // Error classification
  // ---------------------------------------------------------------------------

  private classifyError(err: unknown): ExecutionError {
    const message = err instanceof Error ? err.message : String(err);
    const errorObj = err as Record<string, unknown>;
    const statusCode = typeof errorObj.status === 'number' ? errorObj.status :
                       typeof errorObj.statusCode === 'number' ? errorObj.statusCode : undefined;
    const errorId = this.extractErrorId(errorObj);
    const type = this.determineErrorType(errorObj, statusCode, message);
    return {
      type,
      message: this.formatErrorMessage(type, message, errorId),
      code: errorId || statusCode,
      raw: err,
    };
  }

  private determineErrorType(
    errorObj: Record<string, unknown>,
    statusCode: number | undefined,
    message: string
  ): ErrorType {
    if (statusCode === 401 || statusCode === 403) return 'AUTH_ERROR';
    if (statusCode === 429) return 'RATE_LIMIT';
    if (
      message.includes('ECONNREFUSED') ||
      message.includes('ENOTFOUND') ||
      message.includes('ETIMEDOUT') ||
      message.includes('network') ||
      message.includes('fetch')
    ) return 'NETWORK_ERROR';
    if (message.includes('sandbox') || message.includes('Sandbox')) return 'SANDBOX_LIMITATION';
    if (
      statusCode === 400 ||
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required')
    ) return 'VALIDATION_ERROR';
    return 'UNKNOWN';
  }

  private extractErrorId(errorObj: Record<string, unknown>): string | undefined {
    if (errorObj.errors && Array.isArray(errorObj.errors)) {
      const first = (errorObj.errors as Record<string, unknown>[])[0];
      if (first && typeof first.errorId === 'string') return first.errorId;
    }
    if (typeof errorObj.errorId === 'string') return errorObj.errorId;
    return undefined;
  }

  private formatErrorMessage(type: ErrorType, originalMessage: string, errorId?: string): string {
    const prefix = `[${type}]`;
    const code = errorId ? ` (${errorId})` : '';
    return `${prefix}${code}: ${originalMessage}`;
  }

  private attemptPayloadCorrection(
    payload: EbayInventoryItem,
    error: ExecutionError
  ): EbayInventoryItem {
    const corrected = { ...payload };
    const message = error.message.toLowerCase();
    if (message.includes('country') && !corrected.sourceMetadata.category) {
      corrected.sourceMetadata = { ...corrected.sourceMetadata, category: 'US' };
    }
    return corrected;
  }
}
