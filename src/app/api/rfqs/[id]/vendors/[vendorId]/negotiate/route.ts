import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { sendVendorNegotiation } from "@/lib/vendor-outreach";

type Params = { params: Promise<{ id: string; vendorId: string }> };

const bodySchema = z.object({
  plainNote: z.string().trim().min(3, "Write a short negotiation note"),
});

/** AI-format a negotiation note and email it on the same Recore thread. */
export async function POST(request: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, vendorId } = await params;
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const outreach = await sendVendorNegotiation({
      rfqId: id,
      vendorId,
      plainNote: parsed.data.plainNote,
    });

    return NextResponse.json({
      id: outreach.id,
      status: outreach.status,
      threadRef: outreach.threadRef,
      negotiatedAt: outreach.negotiatedAt?.toISOString() || null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Negotiation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
