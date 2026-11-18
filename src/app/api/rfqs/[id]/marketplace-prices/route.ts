import { NextRequest, NextResponse } from "next/server";
import type { Product } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import {
  catalogBindingLooksMismatched,
  matchProductsToRfqItems,
} from "@/lib/product-match";
import { buildMarketplaceLineQueries, buildMarketplaceQuery, extractBudget } from "@/lib/marketplace/query";
import { searchMarketplaces } from "@/lib/marketplace/search";
import { loadStoredMarketplacePrices, normalizeMarketplaceComparison, saveMarketplacePrices } from "@/lib/marketplace/store";
import { relevantListings, usableCatalogPrice } from "@/lib/marketplace/relevance";
import type { MarketplaceComparison, MarketplaceLineComparison } from "@/lib/marketplace/types";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export const maxDuration = 60;

const CATALOG_MATCH_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  unit: true,
  offerPrice: true,
  lastPrice: true,
  basePrice: true,
  mrp: true,
  taxRate: true,
  brand: true,
  category: true,
  subCategory: true,
  modelNo: true,
  partNo: true,
  popularCode: true,
  commCode: true,
  sourceProductId: true,
  active: true,
} as const;

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

  const lineQueries = buildMarketplaceLineQueries(input);
  const products = await prisma.product.findMany({
    where: { active: true },
    select: CATALOG_MATCH_SELECT,
  });
  const itemMatches = matchProductsToRfqItems(products as Product[], input, 4);

  const errors: string[] = [];
  const lines: MarketplaceLineComparison[] = await Promise.all(
    lineQueries.map(async (line) => {
      const searched = await searchMarketplaces(line.query, { timeoutMs: 12_000 });
      for (const message of searched.errors) {
        errors.push(`Line ${line.lineNumber}: ${message}`);
      }
      const top = itemMatches
        .find((item) => item.lineNumber === line.lineNumber)
        ?.matches.find((match) => {
          if (usableCatalogPrice(match.product.offerPrice) == null) return false;
          return !catalogBindingLooksMismatched(
            line.label,
            `${match.product.name} ${match.product.description || ""}`
          );
        });
      return {
        lineNumber: line.lineNumber,
        label: line.label,
        query: line.query,
        catalogPrice: usableCatalogPrice(top?.product.offerPrice ?? null),
        catalogProductName: top?.product.name ?? null,
        amazon: relevantListings(searched.amazon, line.query),
        flipkart: relevantListings(searched.flipkart, line.query),
        indiamart: relevantListings(searched.indiamart, line.query),
      };
    })
  );

  const first = lines[0];
  const result: MarketplaceComparison = normalizeMarketplaceComparison(
    {
      query,
      budget: extractBudget(rfq.parsedSpecs),
      catalogPrice: first?.catalogPrice ?? null,
      catalogProductName: first?.catalogProductName ?? null,
      amazon: first?.amazon ?? [],
      flipkart: first?.flipkart ?? [],
      indiamart: first?.indiamart ?? [],
      lines,
      ...(errors.length > 0 ? { errors } : {}),
    },
    new Date().toISOString()
  )!;

  result.cached = false;
  result.needsFetch = false;

  await saveMarketplacePrices(id, query, result);
  return NextResponse.json(result);
}
