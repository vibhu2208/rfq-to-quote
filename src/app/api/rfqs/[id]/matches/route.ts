import { NextRequest, NextResponse } from "next/server";
import type { Product } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { matchRfqCatalogHybrid } from "@/lib/hybrid-catalog-match";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Fields required by hybrid catalog match — excludes bulky masterData JSON. */
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

/** Weighted catalog retrieval (top 20) + optional AI re-rank. */
export async function GET(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const skipAi = req.nextUrl.searchParams.get("skipAi") === "1";

  const [rfq, products] = await Promise.all([
    prisma.rfq.findUnique({ where: { id } }),
    prisma.product.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: CATALOG_MATCH_SELECT,
    }),
  ]);

  if (!rfq) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const input = {
    parsedCategory: rfq.parsedCategory,
    parsedSpecs: rfq.parsedSpecs,
    subject: rfq.subject,
    rawText: rfq.rawText,
  };

  const { keywords, requirements, itemMatches, matches, reranked, aiEligible } =
    await matchRfqCatalogHybrid(products as Product[], input, { skipAi });

  return NextResponse.json({
    keywords,
    parsedCategory: rfq.parsedCategory,
    requirements,
    itemMatches,
    matches,
    reranked,
    aiEligible,
  });
}
