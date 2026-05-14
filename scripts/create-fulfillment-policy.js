"use strict";

/**
 * Creates a sandbox fulfillment policy via the eBay Sell Account API.
 *
 * POST /sell/account/v1/fulfillment_policy
 *
 * Usage:
 *   node scripts/create-fulfillment-policy.js
 *
 * On success, prints fulfillmentPolicyId — add it to .env:
 *   EBAY_FULFILLMENT_POLICY_ID=<id>
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

  const url = `${base}/sell/account/v1/fulfillment_policy`;

  const body = {
    name: "Standard Shipping Policy",
    marketplaceId: "EBAY_US",
    categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }],
    handlingTime: { value: 1, unit: "DAY" },
    shippingOptions: [
      {
        optionType: "DOMESTIC",
        costType: "FLAT_RATE",
        shippingServices: [
          {
            shippingServiceCode: "USPSFirstClass",
            buyerResponsibleForShipping: false,
            shippingCost: { currency: "USD", value: "3.99" },
          },
        ],
      },
    ],
  };

  console.log("POST", url);
  console.log("Body:", JSON.stringify(body, null, 2));

  const response = await ebayClient.request({ method: "POST", url, body });

  console.log("\nHTTP status:", response.status);
  console.log(JSON.stringify(response.data, null, 2));

  const policyId = response.data?.fulfillmentPolicyId;
  if (policyId) {
    console.log("\nfulfillmentPolicyId:", policyId);
    console.log("\nAdd to .env:");
    console.log(`EBAY_FULFILLMENT_POLICY_ID=${policyId}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  if (err.context?.bodyPreview) console.error("Body:", err.context.bodyPreview);
  process.exitCode = 1;
});
