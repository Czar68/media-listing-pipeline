"use strict";

/**
 * Public boundary for eBay sandbox API calls. Business code imports ONLY this module.
 * Token/OAuth implementation lives in auth/* (private).
 */

const ebayAuth = require("../auth/ebayAuth");
const ebayConfig = require("../auth/ebayConfig");

const { getAccessToken: authGetAccessToken } = ebayAuth;
const {
  getAuthErrorContext,
  getEbayAuthConfig,
  getConfigResolutionMeta,
  getEbayOAuthTokenEndpoint,
  EbayAuthError,
  SANDBOX_OAUTH_TOKEN_URL,
} = ebayConfig;

/**
 * @param {string} message
 * @param {{
 *   code?: string;
 *   method: string;
 *   url: string;
 *   statusCode: number;
 *   context: Record<string, unknown>;
 *   cause?: unknown;
 * }} meta
 */
class ApiError extends Error {
  constructor(message, meta) {
    super(message);
    this.name = "ApiError";
    this.code = meta.code ?? "API_ERROR";
    this.stage = "API";
    this.method = meta.method;
    this.url = meta.url;
    this.statusCode = meta.statusCode;
    this.context = meta.context;
    if (meta.cause !== undefined) this.cause = meta.cause;
  }
}

/**
 * @param {{ method?: string; url: string; body?: string | Record<string, unknown>; headers?: Record<string, string> }} opts
 * @param {{ after401Retry?: boolean }} [state]
 * @returns {Promise<{ status: number; statusText: string; ok: boolean; data: unknown; text: string }>}
 */
async function request(opts, state = { after401Retry: false }) {
  const method = String(opts.method ?? "GET").toUpperCase();
  const url = String(opts.url ?? "");
  if (!url) {
    throw new ApiError("request() requires url", {
      method,
      url: "",
      statusCode: 0,
      context: {
        ...getAuthErrorContext(""),
        reason: "missing_url",
      },
    });
  }

  let token;
  try {
    token = await authGetAccessToken({});
  } catch (err) {
    if (err instanceof EbayAuthError) throw err;
    throw new ApiError(
      err instanceof Error ? err.message : String(err),
      {
        code: "AUTH_FAILURE",
        method,
        url,
        statusCode: 0,
        context: {
          ...getAuthErrorContext(url),
          reason: "getAccessToken_failed",
        },
        cause: err,
      }
    );
  }

  const headers = { ...(opts.headers || {}) };
  headers.Authorization = `Bearer ${String(token).trim()}`;
  // Required by eBay Sell Inventory API for all PUT/POST calls (errorId 25709 without these)
  headers["Content-Language"] = "en-US";
  headers["Accept-Language"] = "en-US";

  const init = {
    method,
    headers,
  };

  if (opts.body !== undefined) {
    if (typeof opts.body === "string") {
      init.body = opts.body;
    } else {
      init.body = JSON.stringify(opts.body);
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
    }
  }

  let res;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new ApiError(
      `Network error: ${err instanceof Error ? err.message : String(err)}`,
      {
        code: "NETWORK_ERROR",
        method,
        url,
        statusCode: 0,
        context: {
          ...getAuthErrorContext(url),
          reason: "fetch_failed",
        },
        cause: err,
      }
    );
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (res.status === 401 && !state.after401Retry) {
    await authGetAccessToken({ forceRefresh: true });
    return request(opts, { after401Retry: true });
  }

  if (res.status === 401 && state.after401Retry) {
    throw new ApiError("eBay API returned 401 after token refresh", {
      code: "HTTP_UNAUTHORIZED",
      method,
      url,
      statusCode: 401,
      context: {
        ...getAuthErrorContext(url),
        reason: "401_after_refresh",
      },
    });
  }

  if (!res.ok) {
    throw new ApiError(
      `eBay API error: ${res.status} ${res.statusText}`,
      {
        code: "HTTP_ERROR",
        method,
        url,
        statusCode: res.status,
        context: {
          ...getAuthErrorContext(url),
          statusText: res.statusText,
          bodyPreview:
            typeof text === "string" ? text.slice(0, 500) : String(text),
        },
      }
    );
  }

  return {
    status: res.status,
    statusText: res.statusText,
    ok: res.ok,
    data,
    text,
  };
}

module.exports = {
  getAccessToken: authGetAccessToken,
  request,
  ApiError,
  EbayAuthError,
  getEbayAuthConfig,
  getConfigResolutionMeta,
  getEbayOAuthTokenEndpoint,
  assertSandboxAuthConfig: ebayAuth.assertSandboxAuthConfig,
  SANDBOX_OAUTH_TOKEN_URL,
};
