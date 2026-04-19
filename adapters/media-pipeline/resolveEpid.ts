import type { MarketplaceListing } from "./buildMarketplaceListings";

const EBAY_ITEM_SUMMARY_SEARCH =
  "https://api.ebay.com/buy/browse/v1/item_summary/search";

export type EpidResolution = {
  groupKey: string;
  epid: string | null;
  confidence: number;
};

type BrowseItemSummary = {
  product?: { epid?: string | number };
};

type BrowseSearchResponse = {
  itemSummaries?: BrowseItemSummary[];
};

function firstEpidFromSummaries(summaries: BrowseItemSummary[]): string | null {
  for (const item of summaries) {
    const raw = item.product?.epid;
    if (raw === undefined || raw === null) continue;
    const epid = String(raw).trim();
    if (epid.length > 0) return epid;
  }
  return null;
}

async function epidForTitle(title: string): Promise<{
  epid: string | null;
  confidence: number;
}> {
  const token = process.env.EBAY_APP_TOKEN;
  if (!token) {
    return { epid: null, confidence: 0 };
  }

  const q = title.trim();
  if (!q) {
    return { epid: null, confidence: 0 };
  }

  try {
    const url = new URL(EBAY_ITEM_SUMMARY_SEARCH);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "3");

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      return { epid: null, confidence: 0 };
    }

    const data = (await res.json()) as BrowseSearchResponse;
    const summaries = data.itemSummaries ?? [];
    const epid = firstEpidFromSummaries(summaries);

    if (epid !== null) {
      return { epid, confidence: 0.7 };
    }
    return { epid: null, confidence: 0 };
  } catch {
    return { epid: null, confidence: 0 };
  }
}

export async function resolveEpid(
  marketplaceListings: MarketplaceListing[]
): Promise<EpidResolution[]> {
  const results: EpidResolution[] = [];
  for (const listing of marketplaceListings) {
    const { epid, confidence } = await epidForTitle(listing.title);
    results.push({
      groupKey: listing.groupKey,
      epid,
      confidence,
    });
  }
  return results;
}
