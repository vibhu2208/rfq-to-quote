import type { MarketplaceListing, MarketplaceSource } from "@/lib/marketplace/types";

export type MarketplaceBestPrice = {
  source: MarketplaceSource;
  price: number;
  title: string;
  link: string;
};

export function marketplaceQueryFromText(
  ...parts: Array<string | null | undefined>
): string {
  for (const part of parts) {
    const query = (part || "").replace(/\s+/g, " ").trim();
    if (query.length >= 3) return query.slice(0, 120);
  }
  return "";
}

export function bestPricedListing(
  listings: MarketplaceListing[]
): MarketplaceListing | null {
  const priced = listings.filter(
    (listing) => listing.price != null && listing.price > 0
  );
  if (priced.length === 0) return null;
  return [...priced].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0] ?? null;
}

function productTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 2);
}

export function listingsMatchingProduct(
  listings: MarketplaceListing[],
  productName: string
): MarketplaceListing[] {
  const tokens = productTokens(productName);
  if (tokens.length === 0) return listings.filter((listing) => listing.price != null);
  const scored = listings.map((listing) => {
    const title = listing.title.toLowerCase();
    return {
      listing,
      score: tokens.filter((token) => title.includes(token)).length,
    };
  });
  const hits = scored.filter((row) => row.score > 0);
  if (hits.length === 0) return [];
  const best = Math.max(...hits.map((row) => row.score));
  return hits.filter((row) => row.score === best).map((row) => row.listing);
}

export function bestMarketplacePrices(input: {
  amazon: MarketplaceListing[];
  flipkart: MarketplaceListing[];
  indiamart: MarketplaceListing[];
}): {
  amazon: MarketplaceBestPrice | null;
  flipkart: MarketplaceBestPrice | null;
  indiamart: MarketplaceBestPrice | null;
} {
  const pick = (
    source: MarketplaceSource,
    listings: MarketplaceListing[]
  ): MarketplaceBestPrice | null => {
    const listing = bestPricedListing(listings);
    if (!listing || listing.price == null) return null;
    return {
      source,
      price: listing.price,
      title: listing.title,
      link: listing.link,
    };
  };
  return {
    amazon: pick("amazon", input.amazon),
    flipkart: pick("flipkart", input.flipkart),
    indiamart: pick("indiamart", input.indiamart),
  };
}

export function bestMarketplacePricesForProduct(
  input: {
    amazon: MarketplaceListing[];
    flipkart: MarketplaceListing[];
    indiamart: MarketplaceListing[];
  },
  productName: string
) {
  return bestMarketplacePrices({
    amazon: listingsMatchingProduct(input.amazon, productName),
    flipkart: listingsMatchingProduct(input.flipkart, productName),
    indiamart: listingsMatchingProduct(input.indiamart, productName),
  });
}
