import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { matchRfqCatalogHybrid } from "@/lib/hybrid-catalog-match";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Weighted catalog retrieval (top 20) + optional AI re-rank. */
export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const rfq = await prisma.rfq.findUnique({ where: { id } });
  if (!rfq) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  const input = {
    parsedCategory: rfq.parsedCategory,
    parsedSpecs: rfq.parsedSpecs,
    subject: rfq.subject,
    rawText: rfq.rawText,
  };

  const { keywords, requirements, itemMatches, matches, reranked } =
    await matchRfqCatalogHybrid(products, input);

  return NextResponse.json({
    keywords,
    parsedCategory: rfq.parsedCategory,
    requirements,
    itemMatches,
    matches,
    reranked,
  });
}
