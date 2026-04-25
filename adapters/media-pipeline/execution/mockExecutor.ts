import type { NormalizedInventoryItem } from '../types';
import type { EbayInventoryItem } from '../ebayMapper';
import { ListingExecutionAdapter } from './executor';
import type { ExecutionSuccess, ExecutionFailed, ExecutionError, ErrorType, PublishResult } from './types';

/**
 * Mock implementation of the listing execution adapter
 * Returns deterministic responses for development and testing
 * Does not depend on external eBay APIs
 * Handles SINGLE ITEM ONLY - no batch responsibility
 * Output structure matches eBay executor exactly for parity
 */
export class MockExecutor implements ListingExecutionAdapter {
  async execute(input: {
    item: NormalizedInventoryItem;
    ebayPayload: EbayInventoryItem;
  }): Promise<ExecutionSuccess | ExecutionFailed> {
    const { item, ebayPayload } = input;

    try {
      const response = await this.createInventoryItem(ebayPayload);
      
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
        merchantLocationKey: process.env.EBAY_MERCHANT_LOCATION_KEY ?? 'mock-location',
        categoryId: String(process.env.EBAY_LISTING_CATEGORY_ID ?? '111422').trim(),
        ...(listingPolicies !== undefined ? { listingPolicies } : {}),
        pricingSummary: {
          price: {
            value: '9.99',
            currency: 'USD'
          }
        }
      };

      const offerResponse = await this.createOffer(offerBody);
      const offerId = (offerResponse as { data?: { offerId?: string } }).data?.offerId || 
                     (offerResponse as { offerId?: string }).offerId || 
                     ebayPayload.sku;

      const publishResponse = await this.publishOffer(offerId);
      const publishHttpStatus = (publishResponse as { status?: number }).status ?? 200;
      const publishResult: PublishResult = {
        offerId,
        status: 'PUBLISHED',
        httpStatus: publishHttpStatus,
      };

      return {
        item,
        ebayPayload,
        response: this.normalizeResponse(response),
        publishResult,
        recovered: false,
        retryCount: 0,
      };
    } catch (err) {
      const error: ExecutionError = {
        type: 'UNKNOWN',
        message: err instanceof Error ? err.message : String(err),
        raw: err,
      };
      return {
        item,
        ebayPayload,
        error,
        recovered: false,
        retryCount: 0,
      };
    }
  }

  private async createInventoryItem(item: EbayInventoryItem): Promise<unknown> {
    return {
      status: 204,
      statusText: 'No Content',
      ok: true,
      data: null,
      text: '',
    };
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
    pricingSummary: {
      price: {
        value: string;
        currency: string;
      };
    };
  }): Promise<unknown> {
    return {
      status: 201,
      statusText: 'Created',
      ok: true,
      data: {
        offerId: `mock-${item.sku}`,
      },
      text: JSON.stringify({ offerId: `mock-${item.sku}` }),
    };
  }

  private async publishOffer(offerId: string): Promise<unknown> {
    return {
      status: 200,
      statusText: 'OK',
      ok: true,
      data: {
        listingId: `mock-listing-${offerId}`,
      },
      text: JSON.stringify({ listingId: `mock-listing-${offerId}` }),
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
}
