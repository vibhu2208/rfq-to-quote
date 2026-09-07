import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { MarketplaceComparison, MarketplaceListing } from "@/lib/marketplace/types";

function asListings(value: unknown): MarketplaceListing[] {
  if (!Array.isArray(value)) return [];
  return value as MarketplaceListing[];
}

export function normalizeMarketplaceComparison(
  stored: unknown,
  fetchedAt: string
): MarketplaceComparison | null {
  if (!stored || typeof stored !== "object") return null;
  const data = stored as Record<string, unknown>;

  return {
    query: typeof data.query === "string" ? data.query : "",
    budget: typeof data.budget === "number" ? data.budget : null,
    catalogPrice: typeof data.catalogPrice === "number" ? data.catalogPrice : null,
    catalogProductName:
      typeof data.catalogProductName === "string" ? data.catalogProductName : null,
    amazon: asListings(data.amazon),
    flipkart: asListings(data.flipkart),
    indiamart: asListings(data.indiamart),
    fetchedAt,
    cached: true,
    needsFetch: false,
    errors: Array.isArray(data.errors) ? (data.errors as string[]) : undefined,
  };
}

export async function loadStoredMarketplacePrices(
  rfqId: string,
  currentQuery: string
): Promise<MarketplaceComparison | null> {
  const rfq = await prisma.rfq.findUnique({
    where: { id: rfqId },
    select: {
      marketplacePrices: true,
      marketplaceQuery: true,
      marketplaceFetchedAt: true,
    },
  });

  if (!rfq?.marketplacePrices || !rfq.marketplaceFetchedAt) return null;
  if (rfq.marketplaceQuery !== currentQuery) return null;

  return normalizeMarketplaceComparison(
    rfq.marketplacePrices,
    rfq.marketplaceFetchedAt.toISOString()
  );
}

export async function saveMarketplacePrices(
  rfqId: string,
  query: string,
  data: MarketplaceComparison
): Promise<void> {
  const { cached: _cached, needsFetch: _needsFetch, ...payload } = data;
  const normalized = normalizeMarketplaceComparison(
    payload,
    data.fetchedAt
  );
  if (!normalized) return;

  await prisma.rfq.update({
    where: { id: rfqId },
    data: {
      marketplacePrices: {
        ...normalized,
        cached: undefined,
        needsFetch: undefined,
      } as unknown as Prisma.InputJsonValue,
      marketplaceQuery: query,
      marketplaceFetchedAt: new Date(data.fetchedAt),
    },
  });
}

export async function clearMarketplacePrices(rfqId: string): Promise<void> {
  await prisma.rfq.update({
    where: { id: rfqId },
    data: {
      marketplacePrices: Prisma.DbNull,
      marketplaceQuery: null,
      marketplaceFetchedAt: null,
    },
  });
}
