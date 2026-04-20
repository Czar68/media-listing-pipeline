import * as path from 'path';
import type { NormalizedInventoryItem } from '../types';
import type { EbayInventoryItem } from '../ebayMapper';
import { ListingExecutionAdapter } from './executor';
import type { ExecutionSuccess, ExecutionFailed, ExecutionError, ErrorType } from './types';

/**
 * eBay implementation of the listing execution adapter
 * Handles SINGLE ITEM ONLY - no batch responsibility
 * Normalizes responses into ExecutionSuccess | ExecutionFailed
 */
export class EbayExecutor implements ListingExecutionAdapter {
  private baseUrl: string;
  private ebayClient: any;

  constructor() {
    const env = process.env.EBAY_ENV || 'sandbox';
    this.baseUrl = env === 'production'
      ? 'https://api.ebay.com'
      : 'https://api.sandbox.ebay.com';

    // Dynamic require to handle both source and dist locations
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
      const result = await this.executeWithRetry(item, ebayPayload, retryCount);
      return result;
    } catch (err) {
      const error: ExecutionError = this.classifyError(err);
      
      // Attempt retry only for VALIDATION_ERROR
      if (error.type === 'VALIDATION_ERROR' && retryCount === 0) {
        retryCount++;
        const correctedPayload = this.attemptPayloadCorrection(ebayPayload, error);
        
        try {
          const result = await this.executeWithRetry(item, correctedPayload, retryCount);
          // Add recovery metadata
          if ('error' in result) {
            (result as ExecutionFailed).retryCount = retryCount;
            return result;
          } else {
            (result as ExecutionSuccess).recovered = true;
            (result as ExecutionSuccess).retryCount = retryCount;
            return result;
          }
        } catch (retryErr) {
          const retryError: ExecutionError = this.classifyError(retryErr);
          return {
            item,
            ebayPayload: correctedPayload,
            error: retryError,
            retryCount,
          };
        }
      }
      
      return {
        item,
        ebayPayload,
        error,
        retryCount,
      };
    }
  }

  private async executeWithRetry(
    item: NormalizedInventoryItem,
    ebayPayload: EbayInventoryItem,
    retryCount: number
  ): Promise<ExecutionSuccess | ExecutionFailed> {
    const inventoryRequestBody = this.buildInventoryRequestBody(ebayPayload);
    const response = await this.createInventoryItem(inventoryRequestBody);

    const offerBody = {
      sku: ebayPayload.sku,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: 1,
      pricingSummary: {
        price: {
          value: '9.99',
          currency: 'USD'
        }
      }
    };

    let offerId: string;
    try {
      const offerResponse = await this.createOffer(offerBody);
      offerId = (offerResponse as { data?: { offerId?: string } }).data?.offerId || 
                (offerResponse as { offerId?: string }).offerId || 
                ebayPayload.sku;
    } catch (offerErr: unknown) {
      // If offer already exists, extract offerId from error parameters
      const err = offerErr as { context?: { bodyPreview?: string } };
      const bodyPreview = err.context?.bodyPreview;
      if (bodyPreview && bodyPreview.includes('already exists')) {
        try {
          const errorBody = JSON.parse(bodyPreview);
          const offerIdParam = errorBody.errors?.[0]?.parameters?.find((p: { name: string }) => p.name === 'offerId');
          if (offerIdParam?.value) {
            offerId = offerIdParam.value;
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

    await this.publishOffer(offerId);

    return {
      item,
      ebayPayload,
      response: this.normalizeResponse(response),
      recovered: retryCount > 0,
      retryCount,
    };
  }

  private async createInventoryItem(item: EbayInventoryItem): Promise<unknown> {
    const url = `${this.baseUrl}/sell/inventory/v1/inventory_item/${encodeURIComponent(item.sku)}`;

    const response = await this.ebayClient.request({
      method: 'PUT',
      url,
      body: item,
    });

    return response;
  }

  private async createOffer(item: {
    sku: string;
    marketplaceId: string;
    format: string;
    availableQuantity: number;
    pricingSummary: {
      price: {
        value: string;
        currency: string;
      };
    };
  }): Promise<unknown> {
    const url = `${this.baseUrl}/sell/inventory/v1/offer`;

    const response = await this.ebayClient.request({
      method: 'POST',
      url,
      body: item,
    });

    return response;
  }

  private async publishOffer(offerId: string): Promise<unknown> {
    const url = `${this.baseUrl}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`;

    const response = await this.ebayClient.request({
      method: 'POST',
      url,
    });

    return response;
  }

  private buildInventoryRequestBody(ebayPayload: EbayInventoryItem): EbayInventoryItem {
    return {
      sku: ebayPayload.sku,
      condition: ebayPayload.condition,
      product: {
        title: ebayPayload.product.title,
        description: ebayPayload.product.description,
        imageUrls: [...ebayPayload.product.imageUrls],
      },
      sourceMetadata: ebayPayload.sourceMetadata,
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

  private classifyError(err: unknown): ExecutionError {
    const message = err instanceof Error ? err.message : String(err);
    
    // Extract error details from eBay API response format
    const errorObj = err as Record<string, unknown>;
    const statusCode = typeof errorObj.status === 'number' ? errorObj.status : undefined;
    const errorId = this.extractErrorId(errorObj);
    
    // Classify error type
    const type = this.determineErrorType(errorObj, statusCode, message);
    
    return {
      type,
      message: this.formatErrorMessage(type, message, errorId),
      code: errorId || statusCode,
      raw: err,
    };
  }

  private determineErrorType(errorObj: Record<string, unknown>, statusCode: number | undefined, message: string): ErrorType {
    // Check for authentication errors
    if (statusCode === 401 || statusCode === 403) {
      return 'AUTH_ERROR';
    }
    
    // Check for rate limiting
    if (statusCode === 429) {
      return 'RATE_LIMIT';
    }
    
    // Check for network errors
    if (message.includes('ECONNREFUSED') || 
        message.includes('ENOTFOUND') || 
        message.includes('ETIMEDOUT') ||
        message.includes('network') ||
        message.includes('fetch')) {
      return 'NETWORK_ERROR';
    }
    
    // Check for sandbox limitations
    if (message.includes('sandbox') || message.includes('Sandbox')) {
      return 'SANDBOX_LIMITATION';
    }
    
    // Check for validation errors
    if (statusCode === 400 || 
        message.includes('validation') || 
        message.includes('invalid') ||
        message.includes('required')) {
      return 'VALIDATION_ERROR';
    }
    
    // Default to unknown
    return 'UNKNOWN';
  }

  private extractErrorId(errorObj: Record<string, unknown>): string | undefined {
    // Try to extract eBay error ID from common response formats
    if (errorObj.errors && Array.isArray(errorObj.errors)) {
      const firstError = (errorObj.errors as Record<string, unknown>[])[0];
      if (firstError && typeof firstError.errorId === 'string') {
        return firstError.errorId;
      }
    }
    
    if (typeof errorObj.errorId === 'string') {
      return errorObj.errorId;
    }
    
    return undefined;
  }

  private formatErrorMessage(type: ErrorType, originalMessage: string, errorId?: string): string {
    const prefix = `[${type}]`;
    const code = errorId ? ` (${errorId})` : '';
    return `${prefix}${code}: ${originalMessage}`;
  }

  private attemptPayloadCorrection(payload: EbayInventoryItem, error: ExecutionError): EbayInventoryItem {
    const corrected = { ...payload };
    
    // Check error message for specific missing fields
    const message = error.message.toLowerCase();
    
    // Add country if missing and error suggests it's needed
    if (message.includes('country') && !corrected.sourceMetadata.category) {
      corrected.sourceMetadata = {
        ...corrected.sourceMetadata,
        category: 'US',
      };
    }
    
    // Add other safe defaults as needed based on error patterns
    // This can be extended with more specific corrections based on actual API errors
    
    return corrected;
  }
}
