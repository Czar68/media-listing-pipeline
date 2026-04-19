"use strict";

/**
 * Single-item sandbox pipeline test: runBatch with exactly one RawScanResult-like row.
 * Requires: `npm run build -w @media-listing/adapters-media-pipeline` and sandbox credentials.
 *
 * Does not modify pipeline packages.
 */

const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env");
const dotenvResult = require("dotenv").config({ path: envPath });
if (dotenvResult.error) {
  console.warn("[single-item] dotenv:", dotenvResult.error.message);
} else {
  console.log("[single-item] dotenv loaded:", envPath, "exists:", fs.existsSync(envPath));
}

const {
  validateNoProdLeakage,
  assertEbaySandboxCredentialsPresent,
} = require("./ebay-prod-safety.js");
const { runBatch, toEbayInventoryItem } = require("@media-listing/adapters-media-pipeline");

const FIXED_CAPTURED_AT = "2026-01-15T12:00:00.000Z";
const SINGLE_SOURCE = "ebay-single-item-test";

function buildSingleItemDataset() {
  return [
    {
      title: "Single-item sandbox test — first listing",
      externalId: "single-item-001",
      description: "End-to-end sandbox validation (single row).",
      files: ["https://i.ebayimg.com/images/g/placeholder/single-test.jpg"],
      mediaType: "image",
    },
  ];
}

function safeJson(obj) {
  return JSON.stringify(obj, null, 2);
}

/** Best-effort extract of listing/inventory identifiers from ebayClient.request() response. */
function extractEbayListingIds(response) {
  if (response == null || typeof response !== "object") {
    return { listingId: null, raw: null };
  }
  const data = "data" in response ? response.data : response;
  if (data == null || typeof data !== "object") {
    return { listingId: null, note: "empty or non-JSON body (e.g. 204)" };
  }
  const listingId =
    data.listingId ??
    data.itemId ??
    data.inventoryItemGroupKey ??
    (data.listing && data.listing.listingId) ??
    null;
  return { listingId, keys: Object.keys(data) };
}

async function main() {
  process.env.EBAY_ENV = "sandbox";

  console.log("ENV LOADED:", {
    EBAY_ENV: process.env.EBAY_ENV,
    hasClientId: Boolean(
      String(process.env.EBAY_CLIENT_ID_SANDBOX ?? "").trim()
    ),
    hasSecret: Boolean(
      String(process.env.EBAY_CLIENT_SECRET_SANDBOX ?? "").trim()
    ),
    hasRefresh: Boolean(
      String(process.env.EBAY_REFRESH_TOKEN_SANDBOX ?? "").trim()
    ),
  });

  assertEbaySandboxCredentialsPresent();

  const safety = validateNoProdLeakage();

  console.log("[single-item] validateNoProdLeakage OK");
  console.log("[single-item] EBAY_ENV:", process.env.EBAY_ENV);
  console.log("[single-item] Resolved REST base URL:", safety.baseUrl);
  console.log("");

  const dataset = buildSingleItemDataset();
  if (dataset.length !== 1) {
    throw new Error("internal: expected exactly 1 item");
  }

  console.log("[single-item] Calling runBatch with 1 item…\n");

  const { rawScanResults, normalizedInventoryItems, execution } = await runBatch(dataset, {
    defaultSource: SINGLE_SOURCE,
    capturedAt: FIXED_CAPTURED_AT,
  });

  const raw = rawScanResults[0];
  const normalized = normalizedInventoryItems[0];
  const mapped = toEbayInventoryItem(normalized);

  console.log("========== PIPELINE: RAW ==========");
  console.log(safeJson(raw));
  console.log("\n========== PIPELINE: NORMALIZED ==========");
  console.log(safeJson(normalized));
  console.log("\n========== PIPELINE: MAPPED (ebayMapper) ==========");
  console.log(safeJson(mapped));
  console.log("\n========== PIPELINE: EXECUTION ==========");
  console.log(
    "success count:",
    execution.success.length,
    "| failed count:",
    execution.failed.length
  );
  console.log(
    "execution contract:",
    safeJson({
      success: execution.success.length,
      failed: execution.failed.length,
    })
  );

  const ok = execution.success[0];
  const bad = execution.failed[0];

  const finalSku = normalized?.sku ?? "(none)";
  console.log("\n========== RESULT ==========");
  console.log("final SKU:", finalSku);

  if (ok) {
    console.log("\nebayPayload:");
    console.log(safeJson(ok.ebayPayload));
    console.log("\nrequest response (from ebayClient):");
    console.log(safeJson(ok.response));
    const ids = extractEbayListingIds(ok.response);
    console.log("\nsuccess: true");
    console.log("eBay listing / item identifiers:", ids);
  } else if (bad) {
    console.log("\nebayPayload:");
    console.log(safeJson(bad.ebayPayload));
    console.log("\nrequest response: (none — request failed)");
    console.log("\nerror:");
    console.log(bad.error instanceof Error ? bad.error.message : String(bad.error));
    console.log("\nsuccess: false");
    console.log("eBay listing / item identifiers: none (execution failed)");
  } else {
    console.log("\nsuccess: false (no success or failed row — unexpected)");
  }

  console.log("\n[single-item] Done.");
}

main().catch((err) => {
  console.error("[single-item] Fatal:", err);
  process.exitCode = 1;
});
