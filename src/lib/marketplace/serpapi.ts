import type { MarketplaceListing } from "@/lib/marketplace/types";
import { parsePrice } from "@/lib/marketplace/parse-price";

const SERPAPI_BASE = "https://serpapi.com/search.json";
const TOP_RESULTS = 5;

type SerpApiResult<T> = { data: T; error?: string };

function getApiKey(): string | null {
  return process.env.SERPAPI_KEY?.trim() || null;
}

async function serpApiFetch(
  params: Record<string, string>
): Promise<SerpApiResult<Record<string, unknown> | null>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { data: null, error: "SERPAPI_KEY is not configured" };
  }

  const url = new URL(SERPAPI_BASE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("api_key", apiKey);

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) {
      const body = await res.text();
      return { data: null, error: `SerpAPI error ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json()) as Record<string, unknown>;
    if (data.error) {
      return { data: null, error: String(data.error) };
    }
    return { data };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "SerpAPI request failed" };
  }
}

type AmazonOrganicResult = {
  title?: string;
  link?: string;
  price?: string;
  extracted_price?: number;
  rating?: number;
  reviews?: number;
  thumbnail?: string;
};

function toAmazonListing(top: AmazonOrganicResult): MarketplaceListing | null {
  if (!top.link) return null;
  return {
    source: "amazon",
    title: top.title || "Amazon product",
    price: top.extracted_price ?? parsePrice(top.price),
    currency: "INR",
    link: top.link,
    rating: top.rating,
    reviews: top.reviews,
    thumbnail: top.thumbnail,
  };
}

export async function searchAmazonIndia(query: string): Promise<SerpApiResult<MarketplaceListing[]>> {
  const { data, error } = await serpApiFetch({
    engine: "amazon",
    amazon_domain: "amazon.in",
    k: query,
  });

  if (error || !data) return { data: [], error };

  const results = data.organic_results as AmazonOrganicResult[] | undefined;
  const listings = (results ?? [])
    .map(toAmazonListing)
    .filter((item): item is MarketplaceListing => item != null)
    .slice(0, TOP_RESULTS);

  if (listings.length === 0) {
    return { data: [], error: "No Amazon results found" };
  }

  return { data: listings };
}
