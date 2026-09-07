import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { sendVendorRecore } from "@/lib/vendor-outreach";

type Params = { params: Promise<{ id: string; vendorId: string }> };

const bodySchema = z.object({
  productKey: z.string().optional(),
});

/** Send a Recore quote-request email to a matched vendor. */
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
    const outreach = await sendVendorRecore({
      rfqId: id,
      vendorId,
      productKey: parsed.data.productKey,
    });

    if (outreach.status === "FAILED") {
      return NextResponse.json(
        { error: outreach.errorMessage || "Failed to send email" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      id: outreach.id,
      status: outreach.status,
      threadRef: outreach.threadRef,
      sentAt: outreach.sentAt?.toISOString() || null,
      outboundMsgId: outreach.outboundMsgId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Recore failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
