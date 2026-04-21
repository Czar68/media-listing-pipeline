import type { ScanBatchOptions } from "../scanner";

/** Fixed clock for comparable runs (scanner default when rows omit capturedAt). */
export const ADVERSARIAL_FIXED_CAPTURED_AT = "2026-04-20T15:00:00.000Z";

/**
 * Logical dataset definition version (bump when batch composition or scan defaults change).
 * Paired with content-derived `datasetId` / `contentHash` in validation reports.
 */
export const ADVERSARIAL_DATASET_DEFINITION_VERSION = "1.0.0";

/** Stable scan options so SKU and timestamps are deterministic across runs. */
export const ADVERSARIAL_SCAN_OPTIONS: ScanBatchOptions = {
  defaultSource: "adversarial-validation",
  capturedAt: ADVERSARIAL_FIXED_CAPTURED_AT,
};

/**
 * External IDs line up with the validation ebayClient stub routing
 * (`adversarial-validation-<externalId>` SKUs).
 */
export const ADVERSARIAL_EXTERNAL_IDS = {
  ok: "ext-ok",
  auth: "ext-auth",
  rate: "ext-rate",
  net: "ext-net",
  valRetry: "ext-val-retry",
  sandbox: "ext-sandbox",
} as const;

/** Two rows used only for EPID comparison (titles produce a non-empty Browse search query). */
export const EPID_COMPARISON_EXTERNAL_IDS = ["epid-a", "epid-b"] as const;

function rawRow(
  externalId: string,
  title: string,
  extra?: { description?: string; files?: string[]; metadata?: Record<string, unknown> }
): Record<string, unknown> {
  return {
    title,
    description: extra?.description ?? "adversarial validation row",
    externalId,
    files: extra?.files ?? ["https://example.com/adversarial/image.jpg"],
    mediaType: "image",
    metadata: extra?.metadata ?? { suite: "adversarial" },
    capturedAt: ADVERSARIAL_FIXED_CAPTURED_AT,
  };
}

/**
 * Full adversarial batch: stub-driven eBay scenarios + edge titles.
 * Same array instance should be reused across EPID on/off runs for comparability.
 */
export function createAdversarialBatchInputs(): readonly unknown[] {
  return [
    rawRow(ADVERSARIAL_EXTERNAL_IDS.ok, "Adversarial OK row"),
    rawRow(ADVERSARIAL_EXTERNAL_IDS.auth, "Adversarial auth classification"),
    rawRow(ADVERSARIAL_EXTERNAL_IDS.rate, "Adversarial rate limit classification"),
    rawRow(ADVERSARIAL_EXTERNAL_IDS.net, "Adversarial network classification"),
    rawRow(ADVERSARIAL_EXTERNAL_IDS.valRetry, "Adversarial validation retry"),
    rawRow(ADVERSARIAL_EXTERNAL_IDS.sandbox, "Adversarial sandbox classification"),
    rawRow(EPID_COMPARISON_EXTERNAL_IDS[0], "EPID compare alpha", {
      metadata: { suite: "adversarial-epid", slot: "a" },
    }),
    rawRow(EPID_COMPARISON_EXTERNAL_IDS[1], "EPID compare beta", {
      metadata: { suite: "adversarial-epid", slot: "b" },
    }),
  ];
}

export function expectedSku(defaultSource: string, externalId: string): string {
  return `${defaultSource}-${externalId}`;
}
