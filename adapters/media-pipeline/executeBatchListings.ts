import * as path from "path";
import {
  toEbayInventoryItem,
  toEbayInventoryRequestBody,
  type EbayInventoryItem,
} from "./ebayMapper";
import type { NormalizedInventoryItem } from "./types";

type EbayClientModule = {
  request: (opts: {
    method?: string;
    url: string;
    body?: Record<string, unknown>;
  }) => Promise<unknown>;
};

function loadEbayClient(): EbayClientModule {
  try {
    const resolved = path.join(__dirname, "..", "..", "..", "api", "ebayClient.js");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(resolved) as unknown;
    if (
      typeof mod !== "object" ||
      mod === null ||
      typeof (mod as { request?: unknown }).request !== "function"
    ) {
      throw new Error("module must export request()");
    }
    return mod as EbayClientModule;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to load api/ebayClient.js: ${msg}`);
  }
}

/** REST API host from `EBAY_ENV` (aligned with auth sandbox vs prod). */
function getEbayRestApiBaseUrl(): string {
  const e = String(process.env.EBAY_ENV ?? "").trim().toLowerCase();
  if (e === "production" || e === "prod") {
    return "https://api.ebay.com";
  }
  return "https://api.sandbox.ebay.com";
}

/**
 * Result of listing execution: one row per attempted item, no alternate shapes.
 */
export type ExecutionResult = {
  success: Array<{
    item: NormalizedInventoryItem;
    ebayPayload: EbayInventoryItem;
    response: unknown;
  }>;
  failed: Array<{
    item: NormalizedInventoryItem;
    ebayPayload: EbayInventoryItem;
    error: unknown;
  }>;
};

/** @deprecated Use {@link ExecutionResult} */
export type ExecuteBatchListingsResult = ExecutionResult;

export type ExecuteBatchListingsInput =
  | readonly NormalizedInventoryItem[]
  | { readonly normalizedInventoryItems: readonly NormalizedInventoryItem[] };

function resolveNormalizedItems(input: ExecuteBatchListingsInput): NormalizedInventoryItem[] {
  if (
    typeof input === "object" &&
    input !== null &&
    "normalizedInventoryItems" in input &&
    !Array.isArray(input)
  ) {
    return [...(input as { readonly normalizedInventoryItems: readonly NormalizedInventoryItem[] }).normalizedInventoryItems];
  }
  return [...(input as readonly NormalizedInventoryItem[])];
}

/** Last-resort payload if {@link toEbayInventoryItem} throws (corrupt normalized row). */
function ebayPayloadForCorruptNormalizedItem(item: NormalizedInventoryItem): EbayInventoryItem {
  return {
    sku: String(item?.sku ?? "unknown"),
    condition: "NEW",
    product: {
      title: String(item?.title ?? ""),
      description: String(item?.description ?? ""),
      imageUrls: Array.isArray(item?.media?.images) ? [...item.media.images] : [],
    },
    sourceMetadata: {
      system: item?.source?.system ?? "media-listing-pipeline",
      origin: String(item?.source?.origin ?? ""),
      externalId: item?.source?.externalId,
      capturedAt: String(item?.timestamps?.capturedAt ?? ""),
      normalizedAt: String(item?.timestamps?.normalizedAt ?? ""),
      category: item?.category,
    },
  };
}

/**
 * Maps normalized items to eBay payloads and calls `ebayClient.request` once per item.
 * Each iteration is isolated; one failure does not abort the batch.
 */
export async function executeBatchListings(
  itemsOrResult: ExecuteBatchListingsInput,
  ebayClientOverride?: EbayClientModule
): Promise<ExecutionResult> {
  const ebayClient = ebayClientOverride ?? loadEbayClient();
  const items = resolveNormalizedItems(itemsOrResult);
  const success: ExecutionResult["success"] = [];
  const failed: ExecutionResult["failed"] = [];
  const baseUrl = getEbayRestApiBaseUrl();

  for (const item of items) {
    let ebayPayload: EbayInventoryItem;
    try {
      ebayPayload = toEbayInventoryItem(item);
    } catch (mapErr) {
      const fallbackPayload = ebayPayloadForCorruptNormalizedItem(item);
      failed.push({
        item,
        ebayPayload: fallbackPayload,
        error: mapErr,
      });
      continue;
    }

    const url = `${baseUrl}/sell/inventory/v1/inventory_item/${encodeURIComponent(ebayPayload.sku)}`;
    const bodySnapshot = toEbayInventoryRequestBody(ebayPayload);
    const requestBody: Record<string, unknown> = {
      condition: bodySnapshot.condition,
      product: {
        title: bodySnapshot.product.title,
        description: bodySnapshot.product.description,
        imageUrls: [...bodySnapshot.product.imageUrls],
      },
    };

    try {
      const response = await ebayClient.request({
        method: "PUT",
        url,
        body: requestBody,
      });
      success.push({
        item,
        ebayPayload,
        response,
      });
    } catch (err) {
      failed.push({
        item,
        ebayPayload,
        error: err,
      });
    }
  }

  return { success, failed };
}
