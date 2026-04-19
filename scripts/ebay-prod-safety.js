"use strict";

/**
 * Production cutover guard — same EBAY_ENV → base URL rules as adapters/media-pipeline execution.
 * Does not modify pipeline packages.
 */

const SANDBOX_BASE_URL = "https://api.sandbox.ebay.com";
const PROD_BASE_URL = "https://api.ebay.com";

function getResolvedEbayRestApiBaseUrl() {
  const e = String(process.env.EBAY_ENV ?? "").trim().toLowerCase();
  if (e === "production" || e === "prod") {
    return PROD_BASE_URL;
  }
  return SANDBOX_BASE_URL;
}

function isProductionEnv() {
  const e = String(process.env.EBAY_ENV ?? "").trim().toLowerCase();
  return e === "production" || e === "prod";
}

function isProdExplicitlyAllowed() {
  const v = String(process.env.EBAY_ALLOW_PRODUCTION ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Verifies:
 * - Production API host is not used unless EBAY_ENV is production AND EBAY_ALLOW_PRODUCTION is set.
 * - Resolved REST base matches EBAY_ENV (sandbox vs prod), eliminating accidental api.ebay.com in sandbox runs.
 *
 * @returns {{ baseUrl: string, isProduction: boolean }}
 */
function validateNoProdLeakage() {
  const prod = isProductionEnv();

  if (prod && !isProdExplicitlyAllowed()) {
    throw new Error(
      "validateNoProdLeakage: EBAY_ENV is production/prod. Set EBAY_ALLOW_PRODUCTION=1 only when intentionally targeting production APIs."
    );
  }

  const baseUrl = getResolvedEbayRestApiBaseUrl();

  if (prod) {
    if (baseUrl !== PROD_BASE_URL) {
      throw new Error(
        `validateNoProdLeakage: production EBAY_ENV but resolved base URL is ${baseUrl} (expected ${PROD_BASE_URL})`
      );
    }
  } else {
    if (baseUrl !== SANDBOX_BASE_URL) {
      throw new Error(
        `validateNoProdLeakage: non-production EBAY_ENV but resolved base URL is ${baseUrl} (expected ${SANDBOX_BASE_URL})`
      );
    }
    if (baseUrl === PROD_BASE_URL) {
      throw new Error(
        "validateNoProdLeakage: blocked api.ebay.com for non-production EBAY_ENV (sandbox required)."
      );
    }
  }

  return { baseUrl, isProduction: prod };
}

/**
 * Fail fast before any code loads ebayClient / hits the API — requires sandbox OAuth vars.
 */
function assertEbaySandboxCredentialsPresent() {
  const missing = [];
  if (!String(process.env.EBAY_CLIENT_ID_SANDBOX ?? "").trim()) {
    missing.push("EBAY_CLIENT_ID_SANDBOX");
  }
  if (!String(process.env.EBAY_CLIENT_SECRET_SANDBOX ?? "").trim()) {
    missing.push("EBAY_CLIENT_SECRET_SANDBOX");
  }
  if (!String(process.env.EBAY_REFRESH_TOKEN_SANDBOX ?? "").trim()) {
    missing.push("EBAY_REFRESH_TOKEN_SANDBOX");
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required eBay sandbox credentials: ${missing.join(", ")}. ` +
        "Set them in the repo-root `.env` (see `.env.example`) or export them in your shell. " +
        "Aborting before API calls."
    );
  }
}

module.exports = {
  validateNoProdLeakage,
  assertEbaySandboxCredentialsPresent,
  getResolvedEbayRestApiBaseUrl,
  SANDBOX_BASE_URL,
  PROD_BASE_URL,
};
