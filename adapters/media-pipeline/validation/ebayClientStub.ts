import * as path from "path";
import { createRequire } from "node:module";
import { ADVERSARIAL_EXTERNAL_IDS, expectedSku } from "./adversarialDataset";

const req = createRequire(__filename);

export type InventoryPutCounts = Readonly<Record<string, number>>;

function decodeSkuFromInventoryUrl(urlStr: string): string | null {
  const m = urlStr.match(/\/sell\/inventory\/v1\/inventory_item\/([^/?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const DEFAULT_SOURCE = "adversarial-validation";

function skuFor(key: keyof typeof ADVERSARIAL_EXTERNAL_IDS): string {
  return expectedSku(DEFAULT_SOURCE, ADVERSARIAL_EXTERNAL_IDS[key]);
}

/**
 * Test-only stub: emulates `api/ebayClient.request` for adversarial validation.
 * Installed via require cache in the runner process only (does not change pipeline sources).
 */
export function createAdversarialEbayClientRequest(
  putCounts: Record<string, number>
): (opts: {
  method?: string;
  url: string;
  body?: string | Record<string, unknown>;
}) => Promise<{
  status: number;
  statusText: string;
  ok: boolean;
  data: unknown;
  text: string;
}> {
  const skus = {
    ok: skuFor("ok"),
    auth: skuFor("auth"),
    rate: skuFor("rate"),
    net: skuFor("net"),
    valRetry: skuFor("valRetry"),
    sandbox: skuFor("sandbox"),
  };

  return async function request(opts) {
    const urlStr = String(opts.url ?? "");
    const method = String(opts.method ?? "GET").toUpperCase();

    const invSku = decodeSkuFromInventoryUrl(urlStr);
    if (invSku && method === "PUT") {
      putCounts[invSku] = (putCounts[invSku] ?? 0) + 1;

      if (invSku === skus.auth) {
        const e = new Error("eBay API error: 401 Unauthorized");
        (e as { status?: number }).status = 401;
        throw e;
      }
      if (invSku === skus.rate) {
        const e = new Error("eBay API error: 429 Too Many Requests");
        (e as { status?: number }).status = 429;
        throw e;
      }
      if (invSku === skus.net) {
        throw new Error("ECONNREFUSED mock network failure");
      }
      if (invSku === skus.sandbox) {
        throw new Error("sandbox limitation: listing not allowed in this environment");
      }
      if (invSku === skus.valRetry) {
        const n = putCounts[invSku] ?? 0;
        if (n === 1) {
          const e = new Error("validation required: fix product field");
          (e as { status?: number }).status = 400;
          throw e;
        }
      }

      return {
        status: 204,
        statusText: "No Content",
        ok: true,
        data: null,
        text: "",
      };
    }

    if (
      urlStr.includes("/sell/inventory/v1/offer") &&
      !urlStr.includes("/publish") &&
      method === "POST"
    ) {
      const body = opts.body;
      const parsed =
        typeof body === "string"
          ? (JSON.parse(body) as { sku?: string })
          : (body as { sku?: string });
      const sku = parsed?.sku ?? "unknown";
      return {
        status: 201,
        statusText: "Created",
        ok: true,
        data: { offerId: `offer-${sku}` },
        text: JSON.stringify({ offerId: `offer-${sku}` }),
      };
    }

    if (urlStr.includes("/publish") && method === "POST") {
      return {
        status: 200,
        statusText: "OK",
        ok: true,
        data: { listingId: "mock-listing" },
        text: "{}",
      };
    }

    return {
      status: 200,
      statusText: "OK",
      ok: true,
      data: {},
      text: "{}",
    };
  };
}

/**
 * Replaces the resolved `api/ebayClient.js` module in require.cache so {@link EbayExecutor}
 * picks up the stub. Call `restore()` after the ebay-mode run.
 */
export function installEbayClientStubForValidation(): {
  readonly restore: () => void;
  readonly getInventoryPutCounts: () => InventoryPutCounts;
} {
  const clientPath = path.join(process.cwd(), "api", "ebayClient.js");
  const previous = req.cache[clientPath];
  const putCounts: Record<string, number> = {};
  const request = createAdversarialEbayClientRequest(putCounts);

  req.cache[clientPath] = {
    id: clientPath,
    path: clientPath,
    filename: clientPath,
    loaded: true,
    exports: {
      request,
    },
  } as NodeJS.Module;

  return {
    restore: () => {
      if (previous) {
        req.cache[clientPath] = previous;
      } else {
        delete req.cache[clientPath];
      }
    },
    getInventoryPutCounts: () => ({ ...putCounts }),
  };
}
