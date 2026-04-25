"use strict";

/**
 * Creates one sandbox inventory location (POST /sell/inventory/v1/location/{merchantLocationKey}).
 *
 * merchantLocationKey is a PATH parameter — not in the JSON body.
 * Body must match InventoryLocationFull (see eBay Sell Inventory API).
 *
 * Usage:
 *   node scripts/create-merchant-location.js
 *
 * Optional env (defaults shown):
 *   EBAY_MERCHANT_LOCATION_KEY=default-location
 *
 * On success (HTTP 204), add to .env:
 *   EBAY_MERCHANT_LOCATION_KEY=<same key as path>
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const ebayClient = require("../api/ebayClient");

async function createMerchantLocation() {
  process.env.EBAY_ENV = process.env.EBAY_ENV || "sandbox";
  const baseUrl =
    String(process.env.EBAY_ENV).toLowerCase() === "production" ||
    String(process.env.EBAY_ENV).toLowerCase() === "prod"
      ? "https://api.ebay.com/sell/inventory/v1"
      : "https://api.sandbox.ebay.com/sell/inventory/v1";

  const merchantLocationKey = String(
    process.env.EBAY_MERCHANT_LOCATION_KEY ?? "default-location"
  ).trim() || "default-location";

  const url = `${baseUrl}/location/${encodeURIComponent(merchantLocationKey)}`;

  // InventoryLocationFull: address under `location`; name, locationTypes,
  // merchantLocationStatus are ROOT fields (not inside `location`).
  const body = {
    location: {
      address: {
        addressLine1: "123 Test St",
        city: "Cincinnati",
        stateOrProvince: "OH",
        postalCode: "45201",
        country: "US",
      },
    },
    name: "Media listing pipeline default warehouse",
    merchantLocationStatus: "ENABLED",
    locationTypes: ["WAREHOUSE"],
  };

  console.log("POST", url);
  console.log("Body:", JSON.stringify(body, null, 2));

  const response = await ebayClient.request({
    method: "POST",
    url,
    body,
  });

  console.log("\nSuccess. HTTP status:", response.status);
  console.log("\nAdd or set in repo-root .env:");
  console.log(`EBAY_MERCHANT_LOCATION_KEY=${merchantLocationKey}`);
}

createMerchantLocation().catch((err) => {
  console.error("Error:", err.message);
  if (err.context?.bodyPreview) console.error("Body:", err.context.bodyPreview);
  process.exitCode = 1;
});
