"use strict";

/**
 * One-time opt-in: enrolls the sandbox seller account into Business Policy
 * management (SELLING_POLICY_MANAGEMENT) via Sell Account API:
 *   POST /sell/account/v1/program/opt_in
 * Body: { programType: "SELLING_POLICY_MANAGEMENT" } (see optInToProgram in eBay docs).
 *
 * Required before fetch-policies.js or any fulfillment/payment/return policy
 * API calls will succeed. Fixes errorId 20403 "User is not eligible for
 * Business Policy."
 *
 * Usage:
 *   node scripts/opt-in-selling-policy-management.js
 *
 * Safe to run more than once — eBay returns 200 if already enrolled.
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

  const url = `${base}/sell/account/v1/program/opt_in`;
  const body = { programType: "SELLING_POLICY_MANAGEMENT" };

  console.log("POST", url);
  console.log("Body:", JSON.stringify(body, null, 2));

  const response = await ebayClient.request({ method: "POST", url, body });

  console.log("\nHTTP status:", response.status);
  console.log(JSON.stringify(response.data, null, 2));
  console.log("\nOpt-in complete. Run node scripts/fetch-policies.js to verify.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  if (err.context?.bodyPreview) console.error("Body:", err.context.bodyPreview);
  process.exitCode = 1;
});
