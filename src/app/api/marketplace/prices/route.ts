import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { searchMarketplaces } from "@/lib/marketplace/search";
import { bestMarketplacePrices } from "@/lib/marketplace/summary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  query: z.string().trim().min(3).max(120),
});

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a product name to search marketplaces" },
      { status: 400 }
    );
  }

  const query = parsed.data.query;
  const searched = await searchMarketplaces(query);
  return NextResponse.json({
    query,
    amazon: searched.amazon,
    flipkart: searched.flipkart,
    indiamart: searched.indiamart,
    best: bestMarketplacePrices(searched),
    errors: searched.errors.length > 0 ? searched.errors : undefined,
  });
}
