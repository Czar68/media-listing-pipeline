/** Catalog API product summary (subset). */
type CatalogProductSummary = {
  epid?: string;
  title?: string;
  localizedAspects?: Array<{ name?: string; value?: string }>;
};

type CatalogSearchResponse = {
  productSummaries?: CatalogProductSummary[];
};

const ASPECT_NAME_MAP: Readonly<Record<string, keyof Omit<EbayItemSpecifics, "epid" | "title">>> = {
  platform: "platform",
  genre: "genre",
  publisher: "publisher",
  "esrb rating": "esrbRating",
  "release year": "releaseYear",
};

export interface EbayItemSpecifics {
  readonly platform: string | null;
  readonly genre: string | null;
  readonly publisher: string | null;
  readonly esrbRating: string | null;
  readonly releaseYear: string | null;
  readonly epid: string | null;
  readonly title: string | null;
}

function getEbayApiBaseUrl(): string {
  const e = String(process.env.EBAY_ENV ?? "").trim().toLowerCase();
  if (e === "production" || e === "prod") {
    return "https://api.ebay.com";
  }
  return "https://api.sandbox.ebay.com";
}

function normalizeAspectName(name: string): string {
  return name.trim().toLowerCase();
}

function emptySpecifics(): EbayItemSpecifics {
  return {
    platform: null,
    genre: null,
    publisher: null,
    esrbRating: null,
    releaseYear: null,
    epid: null,
    title: null,
  };
}

function specificsFromSummary(summary: CatalogProductSummary): EbayItemSpecifics {
  const out = emptySpecifics();
  const aspects: Partial<Record<keyof Omit<EbayItemSpecifics, "epid" | "title">, string>> = {};

  const la = summary.localizedAspects;
  if (Array.isArray(la)) {
    for (const a of la) {
      const name = typeof a.name === "string" ? a.name.trim() : "";
      const value = typeof a.value === "string" ? a.value.trim() : "";
      if (!name || !value) continue;
      const key = ASPECT_NAME_MAP[normalizeAspectName(name)];
      if (key && aspects[key] === undefined) {
        aspects[key] = value;
      }
    }
  }

  const rawEpid = summary.epid;
  const epid =
    rawEpid !== undefined && rawEpid !== null && String(rawEpid).trim().length > 0
      ? String(rawEpid).trim()
      : null;

  const rawTitle = summary.title;
  const title =
    typeof rawTitle === "string" && rawTitle.trim().length > 0 ? rawTitle.trim() : null;

  return {
    platform: aspects.platform ?? null,
    genre: aspects.genre ?? null,
    publisher: aspects.publisher ?? null,
    esrbRating: aspects.esrbRating ?? null,
    releaseYear: aspects.releaseYear ?? null,
    epid,
    title,
  };
}

/**
 * UPC-keyed eBay Catalog API lookup for video-game item specifics.
 * On any failure, non-200, empty results, or missing token: returns null — never throws.
 */
export async function fetchItemSpecificsByUpc(
  upc: string,
  accessToken: string,
): Promise<EbayItemSpecifics | null> {
  const needle = upc.trim();
  const token = accessToken.trim();
  if (!needle || !token) {
    return null;
  }

  try {
    const base = getEbayApiBaseUrl();
    const url = new URL(`${base}/commerce/catalog/v1_beta/product_summary/search`);
    url.searchParams.set("q", needle);
    url.searchParams.set("fieldGroups", "FULL");

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as CatalogSearchResponse;
    const summary = data.productSummaries?.[0];
    if (!summary) {
      return null;
    }

    return specificsFromSummary(summary);
  } catch {
    return null;
  }
}
