"use strict";

/**
 * eBay OAuth token refresh + .env persistence. Config: ./ebayConfig only.
 */

const fs = require("fs");
const path = require("path");

const ebayConfig = require("./ebayConfig");
const {
  getEbayAuthConfig,
  assertEbayAuthCredentials,
  EbayAuthError,
  getConfigResolutionMeta,
  validateRefreshTokenFormat,
  getEbayOAuthTokenEndpoint,
  getAuthErrorContext,
} = ebayConfig;

const ENV_PATH = path.resolve(__dirname, "../.env");

const EXPIRY_SKEW_SEC = 120;

let refreshInFlight = null;

function isMissingAccessToken(access) {
  return access == null || String(access).trim() === "";
}

function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (b64.length % 4)) % 4;
    b64 += "=".repeat(pad);
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isAccessTokenStillValid(accessToken) {
  const cfg = getEbayAuthConfig();
  const expEpoch = cfg.accessTokenExpiresAt;
  if (expEpoch && /^\d+$/.test(String(expEpoch).trim())) {
    const sec = parseInt(String(expEpoch).trim(), 10);
    const now = Math.floor(Date.now() / 1000);
    return now < sec - EXPIRY_SKEW_SEC;
  }

  const payload = decodeJwtPayload(accessToken);
  if (payload && typeof payload.exp === "number") {
    const now = Math.floor(Date.now() / 1000);
    return now < payload.exp - EXPIRY_SKEW_SEC;
  }

  return false;
}

function mergeIntoEnvFile(updates) {
  let content = "";
  try {
    content = fs.readFileSync(ENV_PATH, "utf8");
  } catch (e) {
    if (/** @type {NodeJS.ErrnoException} */ (e).code !== "ENOENT") throw e;
  }

  const keys = Object.keys(updates);
  let next = content;
  for (const key of keys) {
    const value = updates[key];
    const line = `${key}=${value}`;
    const re = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
    if (re.test(next)) {
      next = next.replace(re, line);
    } else {
      if (next.length && !next.endsWith("\n")) next += "\n";
      next += `${line}\n`;
    }
  }

  fs.writeFileSync(ENV_PATH, next, "utf8");

  for (const key of keys) {
    process.env[key] = updates[key];
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function refreshAccessToken() {
  const endpoint = getEbayOAuthTokenEndpoint();
  const cfg = getEbayAuthConfig();

  const basic = Buffer.from(
    `${cfg.clientId}:${cfg.clientSecret}`,
    "utf8"
  ).toString("base64");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: cfg.refreshToken,
  });

  let res;
  let raw;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: body.toString(),
    });
    raw = await res.text();
  } catch (err) {
    throw new EbayAuthError(
      "TOKEN_ENDPOINT_ERROR",
      `Network failure calling eBay OAuth: ${err instanceof Error ? err.message : String(err)}`,
      {
        stage: "REFRESH",
        context: getAuthErrorContext(endpoint),
        cause: err,
      }
    );
  }

  /** @type {Record<string, unknown>} */
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new EbayAuthError(
      "TOKEN_ENDPOINT_ERROR",
      `OAuth token endpoint returned non-JSON: ${raw.slice(0, 200)}`,
      { stage: "REFRESH", context: getAuthErrorContext(endpoint) }
    );
  }

  if (!res.ok) {
    const oauthErr = typeof data.error === "string" ? data.error : "";
    const desc =
      typeof data.error_description === "string"
        ? data.error_description
        : raw.slice(0, 300);
    const ctx = getAuthErrorContext(endpoint);

    if (oauthErr === "invalid_client") {
      throw new EbayAuthError(
        "invalid_client",
        "eBay rejected the OAuth client credentials (invalid_client).",
        { stage: "REFRESH", context: ctx }
      );
    }

    const detail =
      oauthErr === "invalid_grant"
        ? `OAuth error invalid_grant: ${desc}`
        : `OAuth token request failed: ${res.status} ${res.statusText}. ${desc}`;

    throw new EbayAuthError("TOKEN_ENDPOINT_ERROR", detail, {
      stage: "REFRESH",
      context: ctx,
    });
  }

  const accessToken =
    typeof data.access_token === "string" ? data.access_token : "";
  if (!accessToken) {
    throw new EbayAuthError(
      "TOKEN_ENDPOINT_ERROR",
      "OAuth response did not include access_token.",
      { stage: "REFRESH", context: getAuthErrorContext(endpoint) }
    );
  }

  const expiresIn =
    typeof data.expires_in === "number"
      ? data.expires_in
      : parseInt(String(data.expires_in || "0"), 10) || 0;
  const expiresAtSec =
    expiresIn > 0
      ? Math.floor(Date.now() / 1000) + expiresIn
      : (() => {
          const p = decodeJwtPayload(accessToken);
          return p && typeof p.exp === "number"
            ? p.exp
            : Math.floor(Date.now() / 1000) + 7200;
        })();

  /** @type {Record<string, string>} */
  const envUpdates = {
    EBAY_ACCESS_TOKEN: accessToken,
    EBAY_ACCESS_TOKEN_EXPIRES_AT: String(expiresAtSec),
  };

  if (typeof data.refresh_token === "string" && data.refresh_token.length > 0) {
    envUpdates.EBAY_REFRESH_TOKEN_SANDBOX = data.refresh_token;
  }

  mergeIntoEnvFile(envUpdates);
  return accessToken;
}

async function getAccessToken(options) {
  const forceRefresh = Boolean(options && options.forceRefresh);

  assertEbayAuthCredentials();
  const cfg = getEbayAuthConfig();

  if (
    !forceRefresh &&
    !isMissingAccessToken(cfg.accessToken) &&
    isAccessTokenStillValid(cfg.accessToken)
  ) {
    return String(cfg.accessToken).trim();
  }

  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

module.exports = {
  getAccessToken,
  EbayAuthError,
  assertSandboxAuthConfig: assertEbayAuthCredentials,
  getEbayAuthConfig,
  getEbayOAuthTokenEndpoint,
  getAuthErrorContext,
  getConfigResolutionMeta,
  validateRefreshTokenFormat,
  validateSandboxIdentityConsistency: ebayConfig.validateSandboxIdentityConsistency,
  ENV_PATH,
  SANDBOX_OAUTH_TOKEN_URL: ebayConfig.SANDBOX_OAUTH_TOKEN_URL,
};
