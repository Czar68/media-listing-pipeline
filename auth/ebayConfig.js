"use strict";

/**
 * eBay auth config: process.env only (dotenv loaded once in index.js).
 * Credentials: EBAY_*_SANDBOX only. EBAY_ENV selects OAuth token endpoint URL only.
 */

const REFRESH_TOKEN_PREFIX = "v^1.1#";

const SANDBOX_OAUTH_TOKEN_URL =
  "https://api.sandbox.ebay.com/identity/v1/oauth2/token";
const PRODUCTION_OAUTH_TOKEN_URL =
  "https://api.ebay.com/identity/v1/oauth2/token";

/**
 * EBAY_ENV selects identity endpoint only (default: sandbox).
 * @returns {string}
 */
function getEbayOAuthTokenEndpoint() {
  const e = String(process.env.EBAY_ENV ?? "").trim().toLowerCase();
  if (e === "production" || e === "prod") {
    return PRODUCTION_OAUTH_TOKEN_URL;
  }
  return SANDBOX_OAUTH_TOKEN_URL;
}

/**
 * @param {string | undefined} clientId
 */
function last6(clientId) {
  const id = String(clientId ?? "").trim();
  if (id.length >= 6) return id.slice(-6);
  return id.length > 0 ? id : "";
}

/**
 * Safe diagnostic context (no secrets, no raw tokens).
 * @param {string} endpoint
 */
function getAuthErrorContext(endpoint) {
  const cfg = getEbayAuthConfig();
  return {
    env: process.env.EBAY_ENV ?? "",
    clientIdSuffix: last6(cfg.clientId),
    refreshTokenPresent: Boolean(
      cfg.refreshToken && String(cfg.refreshToken).trim().length > 0
    ),
    endpoint,
  };
}

class EbayAuthError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{
   *   stage?: "CONFIG" | "REFRESH" | "API" | "VALIDATION";
   *   context?: { env: string; clientIdSuffix: string; refreshTokenPresent: boolean; endpoint: string };
   *   cause?: unknown;
   * }} [meta]
   */
  constructor(code, message, meta = {}) {
    super(message);
    this.name = "EbayAuthError";
    this.code = code;
    this.stage = meta.stage ?? "VALIDATION";
    this.context = meta.context ?? {
      env: process.env.EBAY_ENV ?? "",
      clientIdSuffix: "",
      refreshTokenPresent: false,
      endpoint: "",
    };
    if (meta.cause !== undefined) this.cause = meta.cause;
  }
}

/**
 * @param {string} token
 * @returns {boolean}
 */
function validateRefreshTokenFormat(token) {
  const t = String(token ?? "").trim();
  return t.startsWith(REFRESH_TOKEN_PREFIX);
}

/**
 * @param {{ clientId: string; clientSecret: string; refreshToken: string }} params
 * @param {string} [endpoint]
 */
function validateSandboxIdentityConsistency(
  params,
  endpoint = getEbayOAuthTokenEndpoint()
) {
  const clientId = String(params.clientId ?? "").trim();
  const clientSecret = String(params.clientSecret ?? "").trim();
  const refreshToken = String(params.refreshToken ?? "").trim();
  const ctx = () => getAuthErrorContext(endpoint);

  if (!clientId || !clientSecret || !refreshToken) {
    throw new EbayAuthError(
      "SANDBOX_IDENTITY_MISMATCH",
      "Sandbox OAuth credentials are not from the same application identity",
      { stage: "CONFIG", context: ctx() }
    );
  }

  if (!validateRefreshTokenFormat(refreshToken)) {
    throw new EbayAuthError(
      "INVALID_REFRESH_TOKEN_FORMAT",
      `Refresh token must start with "${REFRESH_TOKEN_PREFIX}".`,
      { stage: "CONFIG", context: ctx() }
    );
  }
}

/**
 * @returns {{
 *   env: string | undefined;
 *   clientId: string;
 *   clientSecret: string;
 *   refreshToken: string;
 *   accessToken: string | undefined;
 *   accessTokenExpiresAt: string | undefined;
 * }}
 */
function getEbayAuthConfig() {
  return {
    env: process.env.EBAY_ENV,
    clientId: String(process.env.EBAY_CLIENT_ID_SANDBOX ?? "").trim(),
    clientSecret: String(process.env.EBAY_CLIENT_SECRET_SANDBOX ?? "").trim(),
    refreshToken: String(process.env.EBAY_REFRESH_TOKEN_SANDBOX ?? "").trim(),
    accessToken: process.env.EBAY_ACCESS_TOKEN,
    accessTokenExpiresAt: process.env.EBAY_ACCESS_TOKEN_EXPIRES_AT,
  };
}

function getConfigResolutionMeta() {
  return {
    clientIdSource: "EBAY_CLIENT_ID_SANDBOX",
    clientSecretSource: "EBAY_CLIENT_SECRET_SANDBOX",
    refreshTokenSource: "EBAY_REFRESH_TOKEN_SANDBOX",
  };
}

/**
 * Credential + identity validation only (no EBAY_ENV coupling).
 */
function assertEbayAuthCredentials() {
  const endpoint = getEbayOAuthTokenEndpoint();
  const id = String(process.env.EBAY_CLIENT_ID_SANDBOX ?? "").trim();
  const secret = String(process.env.EBAY_CLIENT_SECRET_SANDBOX ?? "").trim();
  const refresh = String(process.env.EBAY_REFRESH_TOKEN_SANDBOX ?? "").trim();
  const filled = [id, secret, refresh].filter(Boolean).length;

  if (filled === 0) {
    throw new EbayAuthError(
      "MISSING_CLIENT_CREDENTIALS",
      "Set EBAY_CLIENT_ID_SANDBOX, EBAY_CLIENT_SECRET_SANDBOX, and EBAY_REFRESH_TOKEN_SANDBOX. Quote values that contain #.",
      { stage: "CONFIG", context: getAuthErrorContext(endpoint) }
    );
  }

  if (filled !== 3) {
    throw new EbayAuthError(
      "SANDBOX_IDENTITY_MISMATCH",
      "Sandbox OAuth credentials are not from the same application identity",
      { stage: "CONFIG", context: getAuthErrorContext(endpoint) }
    );
  }

  validateSandboxIdentityConsistency(
    { clientId: id, clientSecret: secret, refreshToken: refresh },
    endpoint
  );
}

module.exports = {
  getEbayAuthConfig,
  getEbayOAuthTokenEndpoint,
  getAuthErrorContext,
  getConfigResolutionMeta,
  assertEbayAuthCredentials,
  validateRefreshTokenFormat,
  validateSandboxIdentityConsistency,
  EbayAuthError,
  REFRESH_TOKEN_PREFIX,
  SANDBOX_OAUTH_TOKEN_URL,
  PRODUCTION_OAUTH_TOKEN_URL,
};
