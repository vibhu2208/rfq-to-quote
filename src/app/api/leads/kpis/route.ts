import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { parseLeadFiltersFromSearchParams } from "@/lib/leads/filters";
import { computeLeadKpis, markBreachedSlas } from "@/lib/leads/kpis";

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const filters = parseLeadFiltersFromSearchParams(
    searchParams,
    session?.user?.id
  );

  if (searchParams.get("escalate") === "1") {
    await markBreachedSlas();
  }

  const kpis = await computeLeadKpis(filters);
  return NextResponse.json(kpis);
}
