"use strict";

/**
 * Lists business policies for a marketplace (Sell Account API).
 *
 *   GET {base}/sell/account/v1/payment_policy?marketplace_id=EBAY_US
 *   GET {base}/sell/account/v1/return_policy?marketplace_id=EBAY_US
 *   GET {base}/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US
 *
 * {base} is https://api.sandbox.ebay.com or https://api.ebay.com from EBAY_ENV.
 * Requires OAuth scope: https://api.ebay.com/oauth/api_scope/sell.account (or .readonly).
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const ebayClient = require("../api/ebayClient");
const { getResolvedEbayRestApiBaseUrl, validateNoProdLeakage } = require("./ebay-prod-safety.js");

async function fetchPolicies() {
  process.env.EBAY_ENV = process.env.EBAY_ENV || "sandbox";
  validateNoProdLeakage();

  const root = getResolvedEbayRestApiBaseUrl();
  const baseUrl = `${root}/sell/account/v1`;
  const mp = String(process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US").trim();

  const endpoints = [
    ["payment_policy", "GET /sell/account/v1/payment_policy"],
    ["return_policy", "GET /sell/account/v1/return_policy"],
    ["fulfillment_policy", "GET /sell/account/v1/fulfillment_policy"],
  ];

  for (const [path, label] of endpoints) {
    const url = `${baseUrl}/${path}?marketplace_id=${encodeURIComponent(mp)}`;
    console.log("\n" + "=".repeat(72));
    console.log(label);
    console.log("Full URL:", url);
    console.log("=".repeat(72));
    try {
      const res = await ebayClient.request({ method: "GET", url });
      console.log(JSON.stringify(res, null, 2));
    } catch (err) {
      console.error("Error:", err.message);
      if (err.context?.bodyPreview) console.error("Body:", err.context.bodyPreview);
    }
  }
}

fetchPolicies();
