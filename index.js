const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const {
  getAccessToken,
  request,
  EbayAuthError,
  ApiError,
  getEbayAuthConfig,
  getConfigResolutionMeta,
  assertSandboxAuthConfig,
  getEbayOAuthTokenEndpoint,
  SANDBOX_OAUTH_TOKEN_URL,
} = require("./api/ebayClient");

const EBAY_PRIVILEGE_URL =
  "https://api.sandbox.ebay.com/sell/account/v1/privilege";

function printConfigResolution() {
  const cfg = getEbayAuthConfig();
  const meta = getConfigResolutionMeta();
  const oauthUrl = getEbayOAuthTokenEndpoint();
  console.log("=== CONFIG RESOLUTION ===");
  console.log("ENV:", cfg.env ?? "(undefined)");
  console.log("CLIENT_ID_SOURCE:", meta.clientIdSource);
  console.log("CLIENT_SECRET_SOURCE:", meta.clientSecretSource);
  console.log(
    "REFRESH_TOKEN_PRESENT:",
    Boolean(cfg.refreshToken && cfg.refreshToken.length > 0)
  );
  console.log(
    "ACCESS_TOKEN_PRESENT:",
    Boolean(cfg.accessToken && String(cfg.accessToken).trim().length > 0)
  );
  console.log("OAUTH_TOKEN_URL (from EBAY_ENV):", oauthUrl);
  console.log("========================\n");
}

/**
 * @param {unknown} err
 */
function printAuthErrorDetails(err) {
  if (err instanceof EbayAuthError) {
    console.log("STAGE:", err.stage);
    console.log("CONTEXT:", JSON.stringify(err.context, null, 2));
  }
  if (err instanceof ApiError) {
    console.log("STAGE:", err.stage);
    console.log("METHOD:", err.method);
    console.log("URL:", err.url);
    console.log("STATUS:", err.statusCode);
    console.log("CONTEXT:", JSON.stringify(err.context, null, 2));
  }
}

function printE2EResult(e2e, lastErrorCode, err) {
  console.log("\n=== SANDBOX END-TO-END RESULT ===");
  console.log("ENV:", e2e.env);
  console.log("AUTH:", e2e.auth);
  console.log("TOKEN REFRESH:", e2e.tokenRefresh);
  console.log("TOKEN EXPIRY:", e2e.tokenExpiry);
  console.log("API CALL:", e2e.apiCall);
  console.log("OVERALL STATUS:", e2e.overall);
  if (lastErrorCode) {
    console.log("FAILING STAGE / CODE:", lastErrorCode);
    if (err) printAuthErrorDetails(err);
  }
  console.log("==================================\n");
}

/**
 * @param {unknown} err
 */
function errorCode(err) {
  if (err instanceof EbayAuthError) return err.code;
  if (err instanceof ApiError) return err.code;
  if (err instanceof Error) return err.message;
  return String(err);
}

async function main() {
  const e2e = {
    env: "not verified",
    auth: "not run",
    tokenRefresh: "not run",
    tokenExpiry: "not run",
    apiCall: "not run",
    overall: "FAIL",
  };
  let lastErrorCode = "";

  printConfigResolution();

  const oauthUrl = getEbayOAuthTokenEndpoint();
  if (oauthUrl !== SANDBOX_OAUTH_TOKEN_URL) {
    e2e.env = `FAIL (this script expects sandbox OAuth URL; got ${oauthUrl})`;
    lastErrorCode = "MISSING_CLIENT_CREDENTIALS";
    printE2EResult(e2e, lastErrorCode, undefined);
    process.exitCode = 1;
    return;
  }
  e2e.env = "OK — sandbox OAuth endpoint";

  try {
    assertSandboxAuthConfig();
  } catch (err) {
    e2e.auth = `FAIL — ${errorCode(err)}`;
    lastErrorCode = errorCode(err);
    printE2EResult(e2e, lastErrorCode, err);
    process.exitCode = 1;
    return;
  }
  e2e.auth = "PASS — credentials present";

  try {
    console.log("[eBay] OAuth: refresh_token → access_token (forced refresh)…");
    await getAccessToken({ forceRefresh: true });
    e2e.tokenRefresh = "PASS — exchange succeeded";
  } catch (err) {
    e2e.tokenRefresh = `FAIL — ${errorCode(err)}`;
    lastErrorCode = errorCode(err);
    printE2EResult(e2e, lastErrorCode, err);
    process.exitCode = 1;
    return;
  }

  const expiresAt = String(
    getEbayAuthConfig().accessTokenExpiresAt ?? ""
  ).trim();
  const expiresOk = /^\d+$/.test(expiresAt);
  if (!expiresOk) {
    e2e.tokenExpiry =
      "FAIL — EBAY_ACCESS_TOKEN_EXPIRES_AT missing or not a unix second integer";
    lastErrorCode = "INVALID_TOKEN_EXPIRY";
    printE2EResult(e2e, lastErrorCode, undefined);
    process.exitCode = 1;
    return;
  }
  const expNum = parseInt(expiresAt, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  if (expNum <= nowSec) {
    e2e.tokenExpiry = `FAIL — expires_at in the past (${expiresAt})`;
    lastErrorCode = "EXPIRED_ACCESS_TOKEN_META";
    printE2EResult(e2e, lastErrorCode, undefined);
    process.exitCode = 1;
    return;
  }
  e2e.tokenExpiry = `PASS — EBAY_ACCESS_TOKEN_EXPIRES_AT=${expiresAt} (unix sec, future)`;

  console.log("[eBay] GET sell/account/v1/privilege (sandbox) via ebayClient.request…");
  try {
    const apiResult = await request({
      method: "GET",
      url: EBAY_PRIVILEGE_URL,
    });

    const data = apiResult.data;

    if (data === null || typeof data !== "object") {
      e2e.apiCall = "FAIL — response is not JSON object";
      lastErrorCode = "INVALID_API_JSON";
      printE2EResult(e2e, lastErrorCode, undefined);
      process.exitCode = 1;
      return;
    }

    if (!("sellerRegistrationCompleted" in data)) {
      e2e.apiCall =
        "FAIL — HTTP 200 but sellerRegistrationCompleted field missing";
      lastErrorCode = "MISSING_SELLER_REGISTRATION_FIELD";
      printE2EResult(e2e, lastErrorCode, undefined);
      process.exitCode = 1;
      return;
    }

    const reg = /** @type {{ sellerRegistrationCompleted?: boolean }} */ (data)
      .sellerRegistrationCompleted;
    console.log("Privilege JSON:", JSON.stringify(data, null, 2));
    console.log(
      "[eBay API] sellerRegistrationCompleted:",
      typeof reg === "boolean" ? (reg ? "true" : "false") : String(reg)
    );

    e2e.apiCall = `PASS — HTTP 200, sellerRegistrationCompleted=${String(reg)}`;
    e2e.overall = "PASS";
    printE2EResult(e2e, "", undefined);
  } catch (err) {
    e2e.apiCall = `FAIL — ${errorCode(err)}`;
    lastErrorCode = errorCode(err);
    printE2EResult(e2e, lastErrorCode, err);
    process.exitCode = 1;
  }
}

main();
