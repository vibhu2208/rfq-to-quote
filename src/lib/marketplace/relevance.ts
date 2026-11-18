import { constraintsConflict, extractMatchConstraints, tokenize } from "@/lib/product-match";
import type { MarketplaceListing } from "@/lib/marketplace/types";

const GENERIC = new Set([
  "the",
  "and",
  "for",
  "with",
  "inch",
  "inches",
  "port",
  "ports",
  "new",
  "office",
  "pcs",
  "piece",
  "pieces",
  "qty",
  "quantity",
  "wifi",
  "led",
  "fhd",
  "qhd",
  "uhd",
  "ips",
  "hdmi",
  "displayport",
  "vga",
  "cat6",
  "cat5",
  "gb",
  "kva",
]);

function meaningfulTokens(text: string): string[] {
  return tokenize(text).filter(
    (token) => token.length >= 3 && !GENERIC.has(token) && !/^\d+$/.test(token)
  );
}

function queryIsAccessPoint(query: string): boolean {
  return /\b(?:access\s*points?|wi-?fi\s*6)\b/i.test(query);
}

function titleIsUnrelatedAccessory(title: string): boolean {
  if (/\baccess\s*points?\b/i.test(title)) return false;
  return /\b(?:mount|bracket|arm|energy\s*monitor|speaker|tv\s*wall)\b/i.test(title);
}

/** True when a marketplace title is the same kind of product as the query. */
export function listingRelevantToQuery(title: string, query: string): boolean {
  const q = query.trim();
  const name = title.trim();
  if (q.length < 3 || !name) return false;

  const req = extractMatchConstraints(q);
  const product = extractMatchConstraints(name);
  if (constraintsConflict(req, product)) return false;
  if (queryIsAccessPoint(q) && titleIsUnrelatedAccessory(name)) return false;

  const qTokens = meaningfulTokens(q);
  if (qTokens.length === 0) return req.typeFamily != null && req.typeFamily === product.typeFamily;
  const titleTokens = new Set(meaningfulTokens(name));
  const titleLower = name.toLowerCase();
  const overlap = qTokens.filter(
    (token) => titleTokens.has(token) || titleLower.includes(token)
  );
  if (req.typeFamily && req.typeFamily === product.typeFamily && overlap.length >= 1) return true;
  const needed = qTokens.length === 1 ? 1 : 2;
  return overlap.length >= Math.min(needed, qTokens.length);
}

export function relevantListings<T extends { title: string }>(listings: T[], query: string): T[] {
  return listings.filter((listing) => listingRelevantToQuery(listing.title, query));
}

export function lowestPositivePrice(prices: Array<number | null | undefined>): number | null {
  let best: number | null = null;
  for (const price of prices) {
    if (price == null || !Number.isFinite(price) || price <= 0) continue;
    if (best == null || price < best) best = price;
  }
  return best;
}

export function usableCatalogPrice(price: number | null | undefined): number | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  return price;
}

/** Hide a ₹0 or unrelated catalog row so it is not used as the comparator. */
export function displayCatalogComparator(input: {
  query: string;
  catalogPrice: number | null | undefined;
  catalogProductName: string | null | undefined;
}): { price: number | null; name: string | null } {
  const price = usableCatalogPrice(input.catalogPrice);
  const name = input.catalogProductName?.trim() || "";
  if (price == null || !name) return { price: null, name: null };
  if (!listingRelevantToQuery(name, input.query)) return { price: null, name: null };
  return { price, name };
}

export function filterComparisonListings(
  listings: MarketplaceListing[],
  query: string
): MarketplaceListing[] {
  return relevantListings(listings, query);
}
