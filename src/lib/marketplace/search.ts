import { searchFlipkartApify, searchIndiaMartApify } from "@/lib/marketplace/apify";
import { searchAmazonIndia } from "@/lib/marketplace/serpapi";
import type { MarketplaceListing } from "@/lib/marketplace/types";

export type MarketplaceSearchResult = {
  amazon: MarketplaceListing[];
  flipkart: MarketplaceListing[];
  indiamart: MarketplaceListing[];
  errors: string[];
};

export async function searchMarketplaces(query: string): Promise<MarketplaceSearchResult> {
  const [amazonResult, flipkartResult, indiamartResult] = await Promise.all([
    searchAmazonIndia(query),
    searchFlipkartApify(query),
    searchIndiaMartApify(query),
  ]);

  const errors: string[] = [];
  if (amazonResult.error) errors.push(`Amazon: ${amazonResult.error}`);
  if (flipkartResult.error) errors.push(`Flipkart: ${flipkartResult.error}`);
  if (indiamartResult.error) errors.push(`IndiaMART: ${indiamartResult.error}`);

  return {
    amazon: amazonResult.data ?? [],
    flipkart: flipkartResult.data ?? [],
    indiamart: indiamartResult.data ?? [],
    errors,
  };
}
