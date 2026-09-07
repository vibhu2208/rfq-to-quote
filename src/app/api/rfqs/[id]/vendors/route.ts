import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { matchVendorsToRfq } from "@/lib/vendor-match";
import { getOutreachMapForRfq } from "@/lib/vendor-outreach";

type Params = { params: Promise<{ id: string }> };

/** Deterministic vendor matching from parsed RFQ fields — no AI call. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const rfq = await prisma.rfq.findUnique({ where: { id } });
  if (!rfq) {
    return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
  }

  const result = await matchVendorsToRfq({
    parsedCategory: rfq.parsedCategory,
    parsedSpecs: rfq.parsedSpecs,
    subject: rfq.subject,
    rawText: rfq.rawText,
  });

  const outreaches = await getOutreachMapForRfq(id);
  const matches = result.matches.map((match) => ({
    ...match,
    outreach: outreaches.get(match.vendor.id) || null,
  }));

  return NextResponse.json({ ...result, matches });
}
