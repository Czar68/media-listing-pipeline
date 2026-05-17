import path from "path";
import fs from "fs";
import type { CanonicalExecutionListing } from "../contracts/pipelineStageContracts";
import { toEbayInventoryRequestBody, EbayListingCondition } from "../ebayMapper";
import { buildVideoGameHtmlDescription } from '../videoGameDescription';
import { buildBestOffer } from '../bestOffer';
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

function toEbayApiCondition(
  condition: EbayListingCondition,
  ebayConditionId: number | undefined
): string {
  const idMap: Record<number, string> = {
    1000: 'NEW',
    3000: 'USED_EXCELLENT',
    4000: 'USED_VERY_GOOD',
    5000: 'USED_GOOD',
    6000: 'USED_GOOD',
    7000: 'USED_ACCEPTABLE',
    9000: 'FOR_PARTS_OR_NOT_WORKING',
  };
  if (ebayConditionId !== undefined && idMap[ebayConditionId]) {
    return idMap[ebayConditionId];
  }
  return condition === 'NEW' ? 'NEW' : 'USED_ACCEPTABLE';
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
      const activeOffer = await this.findActiveListingQuantity(base, skuEnc);
      if (activeOffer !== null) {
        const newQuantity = activeOffer.currentQuantity + 1;
        const incremented = await this.incrementListingQuantity(base, skuEnc, newQuantity);
        return {
          item: normalizedInventoryItemFromCanonicalListing(listing),
          ebayPayload: listing,
          response: { status: incremented ? 200 : 207, data: { duplicateDetected: true, newQuantity } },
          publishResult: {
            offerId: activeOffer.offerId,
            status: 'PUBLISHED',
            httpStatus: incremented ? 200 : 207,
          },
          recovered: false,
          retryCount: 0,
        };
      }

      const rawImagePaths: string[] = [];
      const meta = listing.sourceMetadata as Record<string, unknown>;
      const manifestPaths = meta.imagePaths;
      if (Array.isArray(manifestPaths)) {
        for (const p of manifestPaths) {
          if (typeof p === 'string') rawImagePaths.push(p);
        }
      }
      const ebayImageUrls = rawImagePaths.length > 0
        ? await this.uploadImagesToEbay(base, rawImagePaths)
        : [];

      const validEbayImageUrls = ebayImageUrls.filter(
        url => typeof url === 'string' && url.startsWith('https://')
      );

      const baseInv = toEbayInventoryRequestBody(listing);

      const itemAspects = (listing.sourceMetadata as Record<string, unknown>).itemAspects as
        Record<string, string[]> | undefined;

      const aspects: Record<string, string[]> = {
        "Platform": itemAspects?.["Platform"] ?? ["Not Applicable"],
        "Genre": itemAspects?.["Genre"] ?? ["Not Applicable"],
        "Brand": itemAspects?.["Publisher"] ?? ["Unbranded"],
        "Type": ["Disc"],
        "Region Code": ["NTSC-U/C (US/Canada)"],
        "Rating": itemAspects?.["ESRB Rating"] ?? ["Not Rated"],
        "Release Year": itemAspects?.["Release Year"] ?? ["Not Applicable"],
        "Game Name": [baseInv.product.title || "Not Applicable"],
      };

      const htmlDescription = buildVideoGameHtmlDescription({
        title: baseInv.product.title,
        platform: (itemAspects?.["Platform"]?.[0]) ?? null,
        genre: (itemAspects?.["Genre"]?.[0]) ?? null,
        publisher: (itemAspects?.["Publisher"]?.[0]) ?? null,
        esrbRating: (itemAspects?.["ESRB Rating"]?.[0]) ?? null,
        releaseYear: (itemAspects?.["Release Year"]?.[0]) ?? null,
        condition: baseInv.condition,
        sku: listing.sku,
      });

      const ebayConditionId = (listing.sourceMetadata as Record<string, unknown>).ebayConditionId as number | undefined;

      const inventoryPutBody = {
        availability: {
          shipToLocationAvailability: {
            quantity: 1,
          },
        },
        condition: toEbayApiCondition(baseInv.condition, ebayConditionId),
        product: {
          title: baseInv.product.title,
          description: htmlDescription,
          aspects,
          ...((() => {
            const validFallback = baseInv.product.imageUrls.filter(
              (url: string) => typeof url === 'string' && url.startsWith('https://')
            );
            const urls = validEbayImageUrls.length > 0 ? validEbayImageUrls : validFallback;
            return urls.length > 0 ? { imageUrls: urls } : {};
          })()),
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

      const listPriceStr = canonicalListPriceUsd(listing);

      let offerId = await this.tryReuseOffer(base, skuEnc);
      if (offerId === null) {
        const offerResp = await this.createOffer(base, listing, sku, htmlDescription, listPriceStr);
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

  private async findActiveListingQuantity(
    base: string,
    skuEnc: string
  ): Promise<{ offerId: string; currentQuantity: number } | null> {
    try {
      const res = await this.ebay.request({
        method: "GET",
        url: `${base}/sell/inventory/v1/offer?sku=${skuEnc}&marketplace_id=EBAY_US`,
      });
      if (!res.ok || res.data === null || typeof res.data !== "object") return null;
      const data = res.data as { offers?: { offerId?: string; status?: string; availableQuantity?: number }[] };
      const offers = data.offers;
      if (!Array.isArray(offers) || offers.length === 0) return null;
      const published = offers.find((o) => (o.status ?? "").toUpperCase() === "PUBLISHED");
      if (!published) return null;
      const id = published.offerId;
      if (typeof id !== "string" || id.length === 0) return null;
      return { offerId: id, currentQuantity: published.availableQuantity ?? 1 };
    } catch {
      return null;
    }
  }

  private async incrementListingQuantity(
    base: string,
    skuEnc: string,
    newQuantity: number
  ): Promise<boolean> {
    try {
      const res = await this.ebay.request({
        method: "PATCH",
        url: `${base}/sell/inventory/v1/inventory_item/${skuEnc}`,
        body: { availability: { shipToLocationAvailability: { quantity: newQuantity } } },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async uploadImagesToEbay(
    base: string,
    imagePaths: readonly string[]
  ): Promise<string[]> {
    const urls: string[] = [];
    const token = process.env.EBAY_ACCESS_TOKEN ?? '';
    for (const imgPath of imagePaths) {
      try {
        // Remap /app/ container paths to local cwd equivalent
        const localPath = imgPath.startsWith('/app/')
          ? path.join(process.cwd(), imgPath.slice(5))
          : imgPath;
        if (!fs.existsSync(localPath)) continue;
        const fileBuffer = fs.readFileSync(localPath);
        const res = await this.ebay.request({
          method: 'POST',
          url: `${base}/sell/media/v1_beta/inventory_item/image`,
          body: fileBuffer.toString('base64'),
          headers: {
            'Content-Type': 'image/jpeg',
            'Authorization': `Bearer ${token}`,
          },
        });
        if (res.ok && res.data && typeof res.data === 'object') {
          const d = res.data as Record<string, unknown>;
          const imageUrl = typeof d.imageUrl === 'string' ? d.imageUrl : undefined;
          if (imageUrl) urls.push(imageUrl);
        }
      } catch {
        // silently skip failures
      }
    }
    return urls;
  }

  private async createOffer(
    base: string,
    listing: CanonicalExecutionListing,
    sku: string,
    htmlDescription: string,
    listPriceStr: string
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

    const listPriceNum = parseFloat(listPriceStr);
    const bestOffer = buildBestOffer({
      listPrice: listPriceNum,
      acquisitionCost: parseFloat(process.env.ACQUISITION_COST ?? '0') || 0,
      shippingCost: parseFloat(process.env.SHIPPING_COST ?? '3.99') || 3.99,
      adRatePercent: parseFloat(process.env.AD_RATE_PERCENT ?? '3') || 3,
      ebayFeeRate: 0.13,
      ebayFixedFee: 0.30,
    });

    const offerBody = {
      sku,
      marketplaceId: "EBAY_US",
      format: "FIXED_PRICE",
      availableQuantity: 1,
      merchantLocationKey,
      categoryId,
      listingDescription: htmlDescription,
      listingDuration: "GTC",
      listingPolicies: {
        fulfillmentPolicyId,
        paymentPolicyId,
        returnPolicyId,
      },
      pricingSummary: {
        price: {
          currency: "USD",
          value: listPriceStr,
        },
        ...(bestOffer.enabled ? {
          bestOfferTerms: {
            bestOfferEnabled: true,
            autoAcceptPrice: {
              currency: 'USD',
              value: String(bestOffer.autoAcceptPrice!.toFixed(2)),
            },
            autoDeclinePrice: {
              currency: 'USD',
              value: String(bestOffer.autoDeclinePrice!.toFixed(2)),
            },
          },
        } : {}),
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
