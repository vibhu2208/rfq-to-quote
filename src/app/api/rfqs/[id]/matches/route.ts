import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { matchProductsToRfq, extractKeywords } from "@/lib/product-match";

type Params = { params: Promise<{ id: string }> };

/** Deterministic catalog match from parsed RFQ — no AI. */
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

  const matches = matchProductsToRfq(products, input);
  const keywords = extractKeywords(input);

  return NextResponse.json({
    keywords,
    parsedCategory: rfq.parsedCategory,
    matches,
  });
}
