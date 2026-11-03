import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { matchProductsToRfq } from "@/lib/product-match";
import { buildMarketplaceQuery, extractBudget } from "@/lib/marketplace/query";
import { searchMarketplaces } from "@/lib/marketplace/search";
import { loadStoredMarketplacePrices, normalizeMarketplaceComparison, saveMarketplacePrices } from "@/lib/marketplace/store";
import type { MarketplaceComparison } from "@/lib/marketplace/types";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export const maxDuration = 120;

function emptyComparison(query: string, rfq: {
  parsedSpecs: unknown;
}): MarketplaceComparison {
  return {
    query,
    budget: extractBudget(rfq.parsedSpecs),
    catalogPrice: null,
    catalogProductName: null,
    amazon: [],
    flipkart: [],
    indiamart: [],
    fetchedAt: new Date(0).toISOString(),
    needsFetch: true,
  };
}

/** Load stored marketplace prices, or fetch + persist when refresh=true. */
export async function GET(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const refresh = req.nextUrl.searchParams.get("refresh") === "true";

  const rfq = await prisma.rfq.findUnique({ where: { id } });
  if (!rfq) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const input = {
    parsedCategory: rfq.parsedCategory,
    parsedSpecs: rfq.parsedSpecs,
    subject: rfq.subject,
    rawText: rfq.rawText,
  };

  const query = buildMarketplaceQuery(input);
  if (!query) {
    return NextResponse.json(
      { error: "RFQ must be parsed with enough product detail to search marketplaces" },
      { status: 400 }
    );
  }

  if (!refresh) {
    const stored = await loadStoredMarketplacePrices(id, query);
    if (stored) return NextResponse.json(stored);
    return NextResponse.json(emptyComparison(query, rfq));
  }

  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  const catalogMatches = matchProductsToRfq(products, input, 1);
  const topMatch = catalogMatches[0];

  const searched = await searchMarketplaces(query);

  const result: MarketplaceComparison = normalizeMarketplaceComparison(
    {
      query,
      budget: extractBudget(rfq.parsedSpecs),
      catalogPrice: topMatch?.product.offerPrice ?? null,
      catalogProductName: topMatch?.product.name ?? null,
      amazon: searched.amazon,
      flipkart: searched.flipkart,
      indiamart: searched.indiamart,
      ...(searched.errors.length > 0 ? { errors: searched.errors } : {}),
    },
    new Date().toISOString()
  )!;

  result.cached = false;
  result.needsFetch = false;

  await saveMarketplacePrices(id, query, result);
  return NextResponse.json(result);
}
