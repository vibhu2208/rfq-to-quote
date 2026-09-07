import type { MarketplaceListing } from "@/lib/marketplace/types";
import { parsePrice } from "@/lib/marketplace/parse-price";

const APIFY_BASE = "https://api.apify.com/v2";
const TOP_RESULTS = 5;
const FLIPKART_ACTOR = "shahidirfan~flipkart-product-scraper";
const INDIAMART_ACTOR = "natanielsantos~indiamart-scraper";

export type ApifyResult<T> = { data: T; error?: string };

function getToken(): string | null {
  return process.env.APIFY_TOKEN?.trim() || null;
}

async function runActorSync(actorId: string, input: Record<string, unknown>): Promise<ApifyResult<unknown[]>> {
  const token = getToken();
  if (!token) {
    return { data: [], error: "APIFY_TOKEN is not configured" };
  }

  const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text();
      return { data: [], error: `Apify error ${res.status}: ${body.slice(0, 300)}` };
    }

    const items = (await res.json()) as unknown;
    if (!Array.isArray(items)) {
      return { data: [], error: "Apify returned unexpected response format" };
    }

    return { data: items };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : "Apify request failed" };
  }
}

function pickString(item: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizeLink(link: string): string {
  const trimmed = link.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `https://www.indiamart.com${trimmed}`;
  return trimmed;
}

function pickLink(item: Record<string, unknown>): string | undefined {
  const raw = pickString(item, [
    "url",
    "URL",
    "productUrl",
    "product_url",
    "link",
    "productLink",
    "pageUrl",
    "href",
    "pdpUrl",
    "detailUrl",
    "indiamartUrl",
    "listingUrl",
  ]);
  return raw ? normalizeLink(raw) : undefined;
}

function pickTitle(item: Record<string, unknown>): string {
  return (
    pickString(item, [
      "title",
      "productName",
      "product_name",
      "name",
      "prdName",
      "productTitle",
    ]) || "Product"
  );
}

function flattenApifyItems(items: unknown[]): unknown[] {
  const flat: unknown[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      flat.push(item);
      continue;
    }
    const row = item as Record<string, unknown>;
    const nested = row.products ?? row.ads ?? row.results ?? row.listings;
    if (Array.isArray(nested) && nested.length > 0) {
      flat.push(...nested);
      continue;
    }
    flat.push(item);
  }
  return flat;
}

function pickThumbnail(item: Record<string, unknown>): string | undefined {
  const direct = pickString(item, ["thumbnail", "image", "mainImage", "imageUrl"]);
  if (direct) return direct;
  const images = item.images;
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      const img = first as Record<string, unknown>;
      return pickString(img, ["medium", "full", "url"]);
    }
  }
  return undefined;
}

function pickFlipkartPrice(item: Record<string, unknown>): number | null {
  const direct = parsePrice(item.price) ?? parsePrice(item.currentPrice) ?? parsePrice(item.sellingPrice);
  if (direct != null) return direct;

  const priceObj = item.price;
  if (priceObj && typeof priceObj === "object") {
    const p = priceObj as Record<string, unknown>;
    return parsePrice(p.value) ?? parsePrice(p.amount) ?? parsePrice(p.displayString);
  }

  return null;
}

function toFlipkartListing(item: unknown): MarketplaceListing | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const link = pickLink(row);
  if (!link) return null;

  return {
    source: "flipkart",
    title: pickTitle(row),
    price: pickFlipkartPrice(row),
    currency: "INR",
    link,
    rating: typeof row.rating === "number" ? row.rating : parsePrice(row.rating) ?? undefined,
    reviews:
      typeof row.reviews === "number"
        ? row.reviews
        : typeof row.reviewCount === "number"
          ? row.reviewCount
          : undefined,
    thumbnail: pickThumbnail(row),
  };
}

function toIndiaMartListing(item: unknown): MarketplaceListing | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const link = pickLink(row);
  if (!link) return null;

  const priceObj = row.price;
  let price: number | null = null;
  let moq: string | undefined;

  if (priceObj && typeof priceObj === "object") {
    const p = priceObj as Record<string, unknown>;
    price = parsePrice(p.value) ?? parsePrice(p.displayString) ?? parsePrice(p.amount);
    if (typeof p.unit === "string" && p.unit.trim()) {
      moq = `per ${p.unit.trim()}`;
    }
  } else {
    price = parsePrice(row.price) ?? parsePrice(row.priceFormatted) ?? parsePrice(row.formatted_price);
  }

  const company = row.companyDetails ?? row.company ?? row.seller;
  let supplier: string | undefined;
  let rating: number | undefined;
  if (company && typeof company === "object") {
    const c = company as Record<string, unknown>;
    if (typeof c.name === "string") supplier = c.name;
    else if (typeof c.companyName === "string") supplier = c.companyName;
    if (typeof c.score === "number") rating = c.score;
    else if (typeof c.rating === "number") rating = c.rating;
  } else if (typeof row.supplier === "string") {
    supplier = row.supplier;
  } else if (typeof row.companyName === "string") {
    supplier = row.companyName;
  }

  return {
    source: "indiamart",
    title: pickTitle(row),
    price,
    currency: "INR",
    link,
    rating,
    thumbnail: pickThumbnail(row),
    supplier,
    moq,
  };
}

export async function searchFlipkartApify(query: string): Promise<ApifyResult<MarketplaceListing[]>> {
  const startUrl = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`;
  const { data, error } = await runActorSync(FLIPKART_ACTOR, {
    startUrl,
    results_wanted: TOP_RESULTS,
  });

  const listings = data
    .map(toFlipkartListing)
    .filter((item): item is MarketplaceListing => item != null)
    .slice(0, TOP_RESULTS);

  if (listings.length === 0) {
    return { data: [], error: error || "No Flipkart results found" };
  }

  return { data: listings, ...(error ? { error } : {}) };
}

export async function searchIndiaMartApify(query: string): Promise<ApifyResult<MarketplaceListing[]>> {
  const searchUrl = `https://dir.indiamart.com/search.mp?ss=${encodeURIComponent(query)}`;
  const { data, error } = await runActorSync(INDIAMART_ACTOR, {
    startUrls: [{ url: searchUrl }],
    proxySettings: { useApifyProxy: true },
  });

  const listings = flattenApifyItems(data)
    .map(toIndiaMartListing)
    .filter((item): item is MarketplaceListing => item != null)
    .slice(0, TOP_RESULTS);

  if (listings.length === 0) {
    return { data: [], error: error || "No IndiaMART results found" };
  }

  return { data: listings, ...(error ? { error } : {}) };
}
