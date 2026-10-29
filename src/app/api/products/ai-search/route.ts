import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { decimalToNumber } from "@/lib/quotes";
import { catalogSellPrice } from "@/lib/product-price";
import { searchCatalogWithAi } from "@/lib/ai/search-products";

const bodySchema = z.object({
  q: z.string().trim().min(2).max(300),
});

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a product requirement to search" }, { status: 400 });
  }

  try {
    const ids = await searchCatalogWithAi(parsed.data.q);
    if (ids.length === 0) {
      return NextResponse.json({ products: [] });
    }

    const rows = await prisma.product.findMany({
      where: { id: { in: ids }, active: true },
    });
    const byId = new Map(rows.map((p) => [p.id, p]));
    const products = ids
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        unit: p.unit,
        description: p.description,
        hsnCode: p.hsnCode,
        offerPrice: decimalToNumber(p.offerPrice),
        lastPrice: p.lastPrice == null ? null : decimalToNumber(p.lastPrice),
        mrp: p.mrp == null ? null : decimalToNumber(p.mrp),
        basePrice: decimalToNumber(p.basePrice),
        sellPrice: catalogSellPrice(p),
        taxRate: decimalToNumber(p.taxRate),
      }));

    return NextResponse.json({ products });
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
