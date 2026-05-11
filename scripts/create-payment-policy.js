"use strict";

/**
 * Creates a sandbox payment policy via the eBay Sell Account API.
 *
 * POST /sell/account/v1/payment_policy
 *
 * Usage:
 *   node scripts/create-payment-policy.js
 *
 * On success, prints the paymentPolicyId — add it to .env:
 *   EBAY_PAYMENT_POLICY_ID=<id>
 *
 * Safe to run more than once — creates a new policy each time.
 * Delete extras via Seller Hub or the DELETE endpoint if needed.
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const ebayClient = require("../api/ebayClient");
const { validateNoProdLeakage } = require("./ebay-prod-safety.js");

async function main() {
  process.env.EBAY_ENV = process.env.EBAY_ENV || "sandbox";
  validateNoProdLeakage();

  const base =
    String(process.env.EBAY_ENV).toLowerCase() === "production" ||
    String(process.env.EBAY_ENV).toLowerCase() === "prod"
      ? "https://api.ebay.com"
      : "https://api.sandbox.ebay.com";

  const url = `${base}/sell/account/v1/payment_policy`;

  const body = {
    name: "Media Pipeline Payment Policy — Sandbox",
    marketplaceId: "EBAY_US",
    categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }],
    paymentMethods: [{ paymentMethodType: "PERSONAL_CHECK" }],
  };

  console.log("POST", url);
  console.log("Body:", JSON.stringify(body, null, 2));

  const response = await ebayClient.request({ method: "POST", url, body });

  console.log("\nHTTP status:", response.status);
  console.log(JSON.stringify(response.data, null, 2));

  const policyId = response.data?.paymentPolicyId;
  if (policyId) {
    console.log("\nAdd to .env:");
    console.log(`EBAY_PAYMENT_POLICY_ID=${policyId}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  if (err.context?.bodyPreview) console.error("Body:", err.context.bodyPreview);
  process.exitCode = 1;
});
