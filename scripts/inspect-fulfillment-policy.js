"use strict";

/**
 * Read-only diagnostic: inspect the fulfillment policy currently configured
 * in EBAY_FULFILLMENT_POLICY_ID via the eBay Sell Account API.
 *
 * Prints the full policy JSON so you can verify:
 *   - shippingOptions and shippingServiceCode values
 *   - marketplace compatibility
 *   - whether valid domestic shipping services are present for EBAY_US publish
 *
 * Usage:
 *   node scripts/inspect-fulfillment-policy.js
 *
 * Does NOT modify any executor logic or eBay client.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ebayClient = require("../api/ebayClient");
const { validateNoProdLeakage } = require("./ebay-prod-safety.js");

async function main() {
  process.env.EBAY_ENV = process.env.EBAY_ENV || "sandbox";
  validateNoProdLeakage();

  const policyId = String(process.env.EBAY_FULFILLMENT_POLICY_ID ?? "").trim();
  if (!policyId) {
    console.error("ERROR: EBAY_FULFILLMENT_POLICY_ID is not set in .env");
    process.exitCode = 1;
    return;
  }

  const base = process.env.EBAY_ENV === "production"
    ? "https://api.ebay.com"
    : "https://api.sandbox.ebay.com";

  const url = `${base}/sell/account/v1/fulfillment_policy/${encodeURIComponent(policyId)}`;

  console.log("EBAY_ENV              :", process.env.EBAY_ENV);
  console.log("EBAY_FULFILLMENT_POLICY_ID:", policyId);
  console.log("Request URL           :", url);
  console.log("");

  try {
    const res = await ebayClient.request({ method: "GET", url });
    console.log("HTTP status:", res.status);
    console.log("");
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("Request failed:", err.message);
    if (err.statusCode !== undefined) {
      console.error("HTTP status :", err.statusCode);
    }
    if (err.context?.bodyPreview) {
      console.error("Response body:");
      try {
        console.error(JSON.stringify(JSON.parse(err.context.bodyPreview), null, 2));
      } catch {
        console.error(err.context.bodyPreview);
      }
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exitCode = 1;
});
