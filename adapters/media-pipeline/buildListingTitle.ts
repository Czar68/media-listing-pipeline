import type { CanonicalMarket } from "./types";

export function buildListingTitle(m: CanonicalMarket): string {
  const { playerName, statType, marketType, selectionSide } = m.metadata ?? {};
  return [
    playerName,
    statType,
    marketType,
    selectionSide,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
