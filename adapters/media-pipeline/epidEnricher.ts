import type { NormalizedInventoryItem } from "./types";

/** Browse API product summary (subset). */
type BrowseItemSummary = {
  categoryId?: string;
  product?: { epid?: string | number };
  localizedAspects?: Array<{ name?: string; value?: string }>;
};

type BrowseSearchResponse = {
  itemSummaries?: BrowseItemSummary[];
};

function getEbayApiBaseUrl(): string {
  const e = String(process.env.EBAY_ENV ?? "").trim().toLowerCase();
  if (e === "production" || e === "prod") {
    return "https://api.ebay.com";
  }
  return "https://api.sandbox.ebay.com";
}

function buildSearchQuery(item: NormalizedInventoryItem): string {
  const parts: string[] = [];
  const t = item.title.trim();
  if (t) parts.push(t);
  const meta = item.metadata;
  if (meta && typeof meta === "object") {
    for (const v of Object.values(meta)) {
      if (typeof v === "string" && v.trim()) parts.push(v.trim());
      else if (typeof v === "number" && Number.isFinite(v)) parts.push(String(v));
    }
  }
  const q = parts.join(" ").replace(/\s+/g, " ").trim();
  return q.length > 350 ? q.slice(0, 350) : q;
}

function firstEpidFromSummaries(summaries: BrowseItemSummary[]): string | null {
  for (const row of summaries) {
    const raw = row.product?.epid;
    if (raw === undefined || raw === null) continue;
    const epid = String(raw).trim();
    if (epid.length > 0) return epid;
  }
  return null;
}

function aspectsFromSummary(summary: BrowseItemSummary | undefined): Record<string, string[]> | undefined {
  const la = summary?.localizedAspects;
  if (!Array.isArray(la) || la.length === 0) return undefined;
  const out: Record<string, string[]> = {};
  for (const a of la) {
    const name = typeof a.name === "string" ? a.name.trim() : "";
    const value = typeof a.value === "string" ? a.value.trim() : "";
    if (!name || !value) continue;
    if (!out[name]) out[name] = [];
    if (!out[name].includes(value)) out[name].push(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export interface EpidEnrichedInventoryItem extends NormalizedInventoryItem {
  epid?: string;
  epidSource?: "observability_only";
  categoryId?: string;
  itemAspects?: Record<string, string[]>;
  matchConfidence?: number;
}

/**
 * Non-blocking catalog-style EPID lookup (Browse `item_summary/search` → product.epid).
 * On any failure or missing token, returns `item` unchanged. Never throws.
 */
export async function enrichWithEpid(
  item: NormalizedInventoryItem,
  options?: { readonly mode?: "execution" | "ingestion" }
): Promise<EpidEnrichedInventoryItem> {
  if (options?.mode !== "ingestion") {
    return item as EpidEnrichedInventoryItem;
  }

  const existing = item as NormalizedInventoryItem & Partial<EpidEnrichedInventoryItem>;
  if (existing.epid !== undefined && String(existing.epid).trim() !== "") {
    return { ...existing, epidSource: "observability_only" };
  }

  try {
    const token = String(process.env.EBAY_APP_TOKEN ?? "").trim();
    if (!token) {
      return { ...item, epidSource: "observability_only" };
    }

    const q = buildSearchQuery(item);
    if (!q) {
      return { ...item, epidSource: "observability_only" };
    }

    const base = getEbayApiBaseUrl();
    const url = new URL(`${base}/buy/browse/v1/item_summary/search`);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "5");

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      return { ...item, epidSource: "observability_only" };
    }

    const data = (await res.json()) as BrowseSearchResponse;
    const summaries = data.itemSummaries ?? [];
    const epid = firstEpidFromSummaries(summaries);
    const first = summaries[0];

    if (epid === null) {
      return { ...item, epidSource: "observability_only" };
    }

    const categoryId =
      first?.categoryId !== undefined && first.categoryId !== null
        ? String(first.categoryId).trim()
        : undefined;

    const itemAspects = aspectsFromSummary(first);
    const matchConfidence = 0.55 + Math.min(0.35, summaries.length * 0.05);

    return {
      ...item,
      epid,
      epidSource: "observability_only",
      categoryId: categoryId || undefined,
      itemAspects,
      matchConfidence,
    };
  } catch {
    return { ...item, epidSource: "observability_only" };
  }
}
