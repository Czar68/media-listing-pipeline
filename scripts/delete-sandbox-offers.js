"use strict";

/**
 * Deletes all sandbox Sell Inventory offers for this seller.
 *
 * eBay's GET /sell/inventory/v1/offer (getOffers) requires a `sku` query parameter;
 * listing offers without SKU returns error 25707. This script therefore:
 *   1) GET  /sell/inventory/v1/inventory_item?limit=100&offset=... (paginate SKUs)
 *   2) GET  /sell/inventory/v1/offer?sku={sku}&marketplace_id=EBAY_US&limit=100
 *   3) DELETE /sell/inventory/v1/offer/{offerId} for each offer returned
 *
 * Usage:
 *   node scripts/delete-sandbox-offers.js
 *
 * Forces EBAY_ENV=sandbox for this process only — never targets production.
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const ebayClient = require("../api/ebayClient");
const { validateNoProdLeakage, SANDBOX_BASE_URL } = require("./ebay-prod-safety.js");

const LIMIT = 100;

async function listInventoryItemPage(base, offset) {
  const qs = new URLSearchParams({
    limit: String(LIMIT),
    offset: String(offset),
  });
  const url = `${base}/sell/inventory/v1/inventory_item?${qs.toString()}`;
  const res = await ebayClient.request({ method: "GET", url });
  const items = Array.isArray(res.data?.inventoryItems) ? res.data.inventoryItems : [];
  return { items, url };
}

async function listOffersForSku(base, sku) {
  const qs = new URLSearchParams({
    sku,
    marketplace_id: "EBAY_US",
    limit: String(LIMIT),
  });
  const url = `${base}/sell/inventory/v1/offer?${qs.toString()}`;
  const res = await ebayClient.request({ method: "GET", url });
  return Array.isArray(res.data?.offers) ? res.data.offers : [];
}

async function deleteOffer(base, offerId) {
  const url = `${base}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`;
  return ebayClient.request({ method: "DELETE", url });
}

async function main() {
  process.env.EBAY_ENV = "sandbox";
  validateNoProdLeakage();
  const base = SANDBOX_BASE_URL;

  console.log("Sandbox base:", base);
  console.log("Step 1: list inventory_item pages (discover SKUs)\n");

  const skus = [];
  let invOffset = 0;
  let invPage = 0;

  for (;;) {
    invPage += 1;
    const { items, url } = await listInventoryItemPage(base, invOffset);
    console.log(`Inventory page ${invPage}: GET ...?limit=${LIMIT}&offset=${invOffset} → ${items.length} item(s)`);

    for (const item of items) {
      const sku = item.sku;
      if (typeof sku !== "string") continue;
      const s = sku.trim();
      if (!s || s === "undefined") continue;
      skus.push(s);
    }

    invOffset += items.length;
    if (items.length === 0 || items.length < LIMIT) {
      break;
    }
  }

  const uniqueSkus = [...new Set(skus)];
  console.log(`\nUnique SKUs: ${uniqueSkus.length}`);
  if (uniqueSkus.length === 0) {
    console.log("No inventory items — nothing to delete.");
    return;
  }

  console.log("\nStep 2–3: getOffers per SKU, then DELETE each offerId\n");

  for (const sku of uniqueSkus) {
    let offers;
    try {
      offers = await listOffersForSku(base, sku);
    } catch (err) {
      const code = err.statusCode;
      if (code === 404) {
        console.log(`sku=${sku}: (no offers)`);
        continue;
      }
      console.error(`ERROR getOffers sku=${sku}:`, err.message);
      if (err.context?.bodyPreview) console.error("  body:", err.context.bodyPreview);
      continue;
    }

    if (offers.length === 0) {
      console.log(`sku=${sku}: (no offers)`);
      continue;
    }

    for (const o of offers) {
      const offerId = o.offerId ?? o.offer_id;
      if (typeof offerId !== "string" || !offerId.trim()) {
        console.error(`SKIP sku=${sku}: offer missing offerId:`, JSON.stringify(o));
        continue;
      }
      try {
        const del = await deleteOffer(base, offerId);
        console.log(`DELETED sku=${sku} offerId=${offerId} HTTP ${del.status}`);
      } catch (err) {
        console.error(`ERROR DELETE sku=${sku} offerId=${offerId}:`, err.message);
        if (err.context?.bodyPreview) {
          console.error("  body:", err.context.bodyPreview);
        }
      }
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  if (err.context?.bodyPreview) console.error("Body:", err.context.bodyPreview);
  process.exitCode = 1;
});
