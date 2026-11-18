import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { parseAndUpdateRfq } from "@/lib/rfq";
import { userFacingParseError } from "@/lib/fetch-error";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  try {
    const rfq = await parseAndUpdateRfq(id);
    return NextResponse.json(rfq);
  } catch (e) {
    const message = userFacingParseError(e instanceof Error ? e.message : "Parse failed");
    return NextResponse.json({ error: message || "Parse failed" }, { status: 500 });
  }
}
