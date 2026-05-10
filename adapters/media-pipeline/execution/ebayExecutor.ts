import path from "path";
import type { CanonicalExecutionListing } from "../contracts/pipelineStageContracts";
import { toEbayInventoryRequestBody } from "../ebayMapper";
import { normalizedInventoryItemFromCanonicalListing } from "./canonicalListingBridge";
import type { ListingExecutorPort } from "./ports/listingExecutorPort";
import type { ErrorType, ExecutionSuccess, ExecutionFailed } from "./types";

type EbayHttpResponse = {
  status: number;
  statusText: string;
  ok: boolean;
  data: unknown;
  text: string;
};

type EbayClientModule = {
  request(opts: {
    method?: string;
    url: string;
    body?: string | Record<string, unknown>;
    headers?: Record<string, string>;
  }): Promise<EbayHttpResponse>;
};

function loadEbayClient(): EbayClientModule {
  // Compiled to dist/execution — resolve workspace api/ebayClient.js
  const clientPath = path.resolve(__dirname, "..", "..", "..", "..", "api", "ebayClient.js");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(clientPath) as EbayClientModule;
}

function ebaySandboxBase(): string {
  return "https://api.sandbox.ebay.com";
}

function assertEligibleForSandboxEbayListing(): void {
  const execMode = process.env.EXECUTION_MODE?.trim().toLowerCase() ?? "";
  if (execMode !== "sandbox") {
    throw new Error("EbayExecutor only allowed in sandbox mode");
  }
  const ebayEnv = process.env.EBAY_ENV?.trim().toLowerCase() ?? "";
  if (ebayEnv === "production" || ebayEnv === "prod") {
    throw new Error("EbayExecutor blocked when EBAY_ENV targets production");
  }
  if (
    !String(process.env.EBAY_CLIENT_ID_SANDBOX ?? "").trim() ||
    !String(process.env.EBAY_CLIENT_SECRET_SANDBOX ?? "").trim() ||
    !String(process.env.EBAY_REFRESH_TOKEN_SANDBOX ?? "").trim()
  ) {
    throw new Error("EbayExecutor requires sandbox OAuth token configuration (sandbox client id/secret + refresh token)");
  }
}

function canonicalListPriceUsd(listing: CanonicalExecutionListing): string {
  const p = listing as CanonicalExecutionListing & {
    price?: number | { value?: string | number };
    listingPrice?: number;
  };
  let n: number | undefined;
  if (typeof p.price === "number" && Number.isFinite(p.price)) {
    n = p.price;
  } else if (p.price && typeof p.price === "object" && "value" in p.price) {
    const v = (p.price as { value?: string | number }).value;
    const parsed = typeof v === "string" ? parseFloat(v) : v;
    if (typeof parsed === "number" && Number.isFinite(parsed)) n = parsed;
  } else if (typeof p.listingPrice === "number" && Number.isFinite(p.listingPrice)) {
    n = p.listingPrice;
  }
  if (typeof n !== "number" || !Number.isFinite(n)) {
    n = 9.99;
  }
  return n.toFixed(2);
}

function normalizeExecutorResponse(raw: unknown): { status?: number; data?: unknown } {
  if (raw === null || typeof raw !== "object") {
    return { data: raw };
  }
  const response = raw as Record<string, unknown>;
  return {
    status: typeof response.status === "number" ? response.status : undefined,
    data: response.data !== undefined ? response.data : raw,
  };
}

function execFailed(
  listing: CanonicalExecutionListing,
  errMsg: string,
  type: ErrorType = "UNKNOWN",
  raw?: unknown
): ExecutionFailed {
  return {
    item: normalizedInventoryItemFromCanonicalListing(listing),
    ebayPayload: listing,
    error: { type, message: errMsg, raw },
    recovered: false,
    retryCount: 0,
  };
}

/**
 * Sandbox-only Sell Inventory flow: PUT inventory_item → POST offer → POST publish.
 */
export class EbayExecutor implements ListingExecutorPort {
  private readonly ebay = loadEbayClient();

  async execute(listing: CanonicalExecutionListing): Promise<ExecutionSuccess | ExecutionFailed> {
    try {
      assertEligibleForSandboxEbayListing();
    } catch (e) {
      return execFailed(listing, e instanceof Error ? e.message : String(e), "SANDBOX_LIMITATION");
    }

    const base = ebaySandboxBase();
    const sku = listing.sku;
    const skuEnc = encodeURIComponent(sku);

    try {
      const baseInv = toEbayInventoryRequestBody(listing);
      const inventoryPutBody = {
        availability: {
          shipToLocationAvailability: {
            quantity: 1,
          },
        },
        condition: baseInv.condition,
        product: {
          title: baseInv.product.title,
          description: baseInv.product.description,
          ...(baseInv.product.imageUrls.length ? { imageUrls: [...baseInv.product.imageUrls] } : {}),
        },
      };

      let invResp: EbayHttpResponse;
      try {
        invResp = await this.ebay.request({
          method: "PUT",
          url: `${base}/sell/inventory/v1/inventory_item/${skuEnc}`,
          body: inventoryPutBody,
        });
      } catch (err: unknown) {
        return execFailed(listing, err instanceof Error ? err.message : String(err), "NETWORK_ERROR", err);
      }

      let offerId = await this.tryReuseOffer(base, skuEnc);
      if (offerId === null) {
        const offerResp = await this.createOffer(base, listing, sku);
        if ("error" in offerResp) return offerResp.error;
        offerId = offerResp.offerId;
      }

      let pubResp: EbayHttpResponse;
      try {
        pubResp = await this.ebay.request({
          method: "POST",
          url: `${base}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`,
          body: {},
        });
      } catch (err: unknown) {
        return execFailed(listing, err instanceof Error ? err.message : String(err), "NETWORK_ERROR", err);
      }

      const publishData =
        typeof pubResp.data === "object" && pubResp.data !== null ? (pubResp.data as Record<string, unknown>) : {};
      const listingId =
        (typeof publishData.listingId === "string" ? publishData.listingId : undefined) ??
        (typeof publishData.itemId === "string" ? publishData.itemId : undefined);

      return {
        item: normalizedInventoryItemFromCanonicalListing(listing),
        ebayPayload: listing,
        response: normalizeExecutorResponse(invResp),
        publishResult: {
          offerId,
          status: pubResp.ok ? "PUBLISHED" : "FAILED",
          httpStatus: pubResp.status,
          ...(listingId !== undefined ? { listingId } : {}),
        },
        recovered: false,
        retryCount: 0,
      };
    } catch (e: unknown) {
      return execFailed(listing, e instanceof Error ? e.message : String(e), "UNKNOWN", e);
    }
  }

  private async tryReuseOffer(base: string, skuEnc: string): Promise<string | null> {
    try {
      const res = await this.ebay.request({
        method: "GET",
        url: `${base}/sell/inventory/v1/offer?sku=${skuEnc}&marketplace_id=EBAY_US`,
      });
      if (!res.ok || res.data === null || typeof res.data !== "object") return null;
      const data = res.data as { offers?: { offerId?: string; status?: string }[] };
      const offers = data.offers;
      if (!Array.isArray(offers) || offers.length === 0) return null;
      const first =
        offers.find((o) => (o.status ?? "").toUpperCase().includes("UNPUBLISHED")) ?? offers[0];
      const id = first?.offerId;
      return typeof id === "string" && id.length > 0 ? id : null;
    } catch {
      return null;
    }
  }

  private async createOffer(
    base: string,
    listing: CanonicalExecutionListing,
    sku: string
  ): Promise<{ offerId: string } | { error: ExecutionFailed }> {
    const fulfillmentPolicyId = process.env.EBAY_FULFILLMENT_POLICY_ID?.trim();
    const paymentPolicyId = process.env.EBAY_PAYMENT_POLICY_ID?.trim();
    const returnPolicyId = process.env.EBAY_RETURN_POLICY_ID?.trim();
    if (!fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId) {
      return {
        error: execFailed(
          listing,
          "EbayExecutor requires EBAY_FULFILLMENT_POLICY_ID, EBAY_PAYMENT_POLICY_ID, EBAY_RETURN_POLICY_ID",
          "VALIDATION_ERROR"
        ),
      };
    }

    const categoryId = String(process.env.EBAY_LISTING_CATEGORY_ID ?? "267").trim();
    const merchantLocationKey =
      process.env.EBAY_MERCHANT_LOCATION_KEY?.trim() || "mock-location-unset";

    const offerBody = {
      sku,
      marketplaceId: "EBAY_US",
      format: "FIXED_PRICE",
      availableQuantity: 1,
      merchantLocationKey,
      categoryId,
      listingDescription: listing.product.description || listing.product.title,
      listingDuration: "GTC",
      listingPolicies: {
        fulfillmentPolicyId,
        paymentPolicyId,
        returnPolicyId,
      },
      pricingSummary: {
        price: {
          currency: "USD",
          value: canonicalListPriceUsd(listing),
        },
      },
    };

    try {
      const offerResp = await this.ebay.request({
        method: "POST",
        url: `${base}/sell/inventory/v1/offer`,
        body: offerBody,
      });
      const d =
        typeof offerResp.data === "object" && offerResp.data !== null ? (offerResp.data as Record<string, unknown>) : {};
      const offerId =
        (typeof d.offerId === "string" ? d.offerId : undefined) ??
        (typeof d.offer_id === "string" ? (d.offer_id as string) : undefined);
      if (!offerResp.ok || !offerId) {
        return {
          error: execFailed(
            listing,
            `Offer create failed: ${offerResp.status} ${offerResp.statusText}`,
            "VALIDATION_ERROR",
            offerResp.data
          ),
        };
      }
      return { offerId };
    } catch (e: unknown) {
      return { error: execFailed(listing, e instanceof Error ? e.message : String(e), "NETWORK_ERROR", e) };
    }
  }
}
