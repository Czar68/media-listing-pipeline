"use strict";

/**
 * eBay sandbox end-to-end validation: runBatch → real sandbox API via ebayClient.
 * Requires: `npm run build -w @media-listing/adapters-media-pipeline` and valid EBAY_* sandbox credentials.
 *
 * Does not modify pipeline packages — validation / observability only.
 */

const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "..", ".env");
const dotenvResult = require("dotenv").config({ path: envPath });
if (dotenvResult.error) {
  console.warn("[sandbox-validation] dotenv:", dotenvResult.error.message);
} else {
  console.log("[sandbox-validation] dotenv loaded:", envPath, "exists:", fs.existsSync(envPath));
}

const { runBatch } = require("@media-listing/adapters-media-pipeline");
const {
  validateNoProdLeakage,
  assertEbaySandboxCredentialsPresent,
} = require("./ebay-prod-safety.js");

/** Fixed clock for repeatable SKUs (adapter uses externalId when set). */
const FIXED_CAPTURED_AT = "2026-01-15T12:00:00.000Z";
const VALIDATION_SOURCE = "ebay-sandbox-validation";

/**
 * Minimal deterministic RawScanResult-like rows (3–5 items).
 * externalId + shared capturedAt → stable SKU: `${source}-${externalId}`.
 */
function buildValidationDataset() {
  return [
    {
      title: "Sandbox Validation — images only",
      externalId: "val-sku-001",
      files: [
        "https://i.ebayimg.com/images/g/placeholder/sample-a.jpg",
        "https://i.ebayimg.com/images/g/placeholder/sample-b.png",
      ],
      mediaType: "image",
    },
    {
      title: "Sandbox Validation — images + video",
      externalId: "val-sku-002",
      description: "Mixed media row",
      files: [
        "https://i.ebayimg.com/images/g/placeholder/sample-c.jpg",
        "https://example.com/video/sample.mp4",
      ],
      mediaType: "unknown",
      metadata: { case: "images_plus_video" },
    },
    {
      title: "Sandbox Validation — minimal row",
      externalId: "val-sku-003",
      files: ["https://i.ebayimg.com/images/g/placeholder/sample-d.webp"],
    },
    {
      title: "Sandbox Validation — no optional metadata",
      externalId: "val-sku-004",
      files: [
        "https://i.ebayimg.com/images/g/placeholder/sample-e.jpg",
        "https://example.com/clips/clip.mov",
      ],
    },
    {
      title: "Sandbox Validation — empty files list",
      externalId: "val-sku-005",
      description: "Optional description present; no files",
      files: [],
    },
  ];
}

function serializeError(err) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

function summarizePayload(entry, kind) {
  if (!entry) return null;
  const base = {
    sku: entry.item?.sku,
    ebaySku: entry.ebayPayload?.sku,
  };
  if (kind === "success") {
    return {
      ...base,
      responseStatus:
        entry.response && typeof entry.response === "object" && "status" in entry.response
          ? entry.response.status
          : undefined,
      responsePreview: safeJsonPreview(entry.response),
    };
  }
  const err = entry.error;
  const errorLite =
    err instanceof Error ? { name: err.name, message: err.message } : err;
  return {
    ...base,
    error: errorLite,
    ebayPayloadPreview: safeJsonPreview(entry.ebayPayload),
  };
}

function safeJsonPreview(value, maxLen = 1200) {
  try {
    const s = JSON.stringify(value, replacerJson, 2);
    return s.length > maxLen ? s.slice(0, maxLen) + "\n…(truncated)" : s;
  } catch {
    return String(value).slice(0, maxLen);
  }
}

function replacerJson(_key, value) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  return value;
}

async function main() {
  let unhandled;
  function onUnhandledRejection(reason) {
    unhandled = reason;
  }
  process.on("unhandledRejection", onUnhandledRejection);

  const failures = [];

  try {
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

    const { baseUrl } = validateNoProdLeakage();
    console.log("[sandbox-validation] EBAY_ENV (forced):", process.env.EBAY_ENV);
    console.log("[sandbox-validation] validateNoProdLeakage OK — resolved REST base URL:", baseUrl);

    const dataset = buildValidationDataset();
    const inputCount = dataset.length;

    console.log("[sandbox-validation] Starting runBatch with", inputCount, "items\n");

    const { rawScanResults, normalizedInventoryItems, execution } = await runBatch(dataset, {
      defaultSource: VALIDATION_SOURCE,
      capturedAt: FIXED_CAPTURED_AT,
    });

    console.log("[sandbox-validation] rawScanResults count:", rawScanResults.length);
    console.log("[sandbox-validation] normalizedInventoryItems count:", normalizedInventoryItems.length);
    console.log(
      "[sandbox-validation] execution success:",
      execution.success.length,
      "| failed:",
      execution.failed.length
    );

    // Per-item SKU + status
    const bySku = new Map();
    for (const row of execution.success) {
      bySku.set(row.item.sku, { status: "success" });
    }
    for (const row of execution.failed) {
      bySku.set(row.item.sku, { status: "failed", error: serializeError(row.error) });
    }
    for (const n of normalizedInventoryItems) {
      const st = bySku.get(n.sku);
      const line = st
        ? `[${st.status}] sku=${n.sku}`
        : `[missing-from-execution] sku=${n.sku}`;
      console.log("[sandbox-validation] per-item:", line);
    }

    // --- Validation checks ---
    if (rawScanResults.length !== inputCount) {
      failures.push(
        `Check 1 failed: rawScanResults count ${rawScanResults.length} !== input ${inputCount}`
      );
    }
    if (normalizedInventoryItems.length !== inputCount) {
      failures.push(
        `Check 1 failed: normalizedInventoryItems count ${normalizedInventoryItems.length} !== input ${inputCount}`
      );
    }
    if (execution.success.length + execution.failed.length !== inputCount) {
      failures.push(
        `Check 3 failed: success (${execution.success.length}) + failed (${execution.failed.length}) !== input (${inputCount})`
      );
    }

    const executionSkus = new Set([
      ...execution.success.map((s) => s.item.sku),
      ...execution.failed.map((f) => f.item.sku),
    ]);
    for (const n of normalizedInventoryItems) {
      if (!executionSkus.has(n.sku)) {
        failures.push(
          `Check 1 (execution coverage) failed: normalized SKU ${n.sku} missing from execution success/failed`
        );
      }
    }

    for (let i = 0; i < execution.failed.length; i++) {
      const f = execution.failed[i];
      if (!f || typeof f !== "object") {
        failures.push(`Check 4 failed: failed[${i}] is not an object`);
        continue;
      }
      if (!("item" in f) || f.item === undefined) {
        failures.push(`Check 4 failed: failed[${i}] missing item`);
      }
      if (!("ebayPayload" in f) || f.ebayPayload === undefined) {
        failures.push(`Check 4 failed: failed[${i}] missing ebayPayload`);
      }
      if (!("error" in f)) {
        failures.push(`Check 4 failed: failed[${i}] missing error`);
      }
    }

    if (unhandled !== undefined) {
      failures.push(`Check 2 failed: unhandledRejection observed: ${String(unhandled)}`);
    }

    const totalScanned = rawScanResults.length;
    const totalNormalized = normalizedInventoryItems.length;
    const totalSuccess = execution.success.length;
    const totalFailed = execution.failed.length;
    const ratePct =
      inputCount === 0 ? 0 : Number(((totalSuccess / inputCount) * 100).toFixed(2));

    console.log("\n--- Structured summary ---");
    console.log(JSON.stringify({
      totalScanned,
      totalNormalized,
      totalSuccess,
      totalFailed,
      successRatePercent: ratePct,
      sampleSuccess: summarizePayload(execution.success[0], "success"),
      sampleFailed:
        execution.failed.length > 0 ? summarizePayload(execution.failed[0], "failed") : null,
    }, null, 2));

    if (failures.length > 0) {
      console.error("\n[sandbox-validation] VALIDATION FAILED:");
      for (const msg of failures) {
        console.error("  -", msg);
      }
      process.exitCode = 1;
    } else {
      console.log("\n[sandbox-validation] All validation checks passed.");
    }
  } catch (err) {
    console.error("[sandbox-validation] Runner error:", err);
    process.exitCode = 1;
  } finally {
    process.off("unhandledRejection", onUnhandledRejection);
  }
}

main();
