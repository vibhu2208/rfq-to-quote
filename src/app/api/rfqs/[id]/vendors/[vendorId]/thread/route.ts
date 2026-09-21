import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { getVendorOutreachThread } from "@/lib/vendor-outreach";

type Params = { params: Promise<{ id: string; vendorId: string }> };

/** Return Recore / negotiation / reply email thread for one vendor on this RFQ. */
export async function GET(_request: Request, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, vendorId } = await params;
  try {
    const thread = await getVendorOutreachThread({ rfqId: id, vendorId });
    return NextResponse.json(thread);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load thread";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
