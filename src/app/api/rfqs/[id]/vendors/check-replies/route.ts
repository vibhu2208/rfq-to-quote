import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { checkVendorOutreachThread } from "@/lib/gmail-imap";
import { reparseStoredVendorReplies } from "@/lib/vendor-outreach";

type Params = { params: Promise<{ id: string }> };

/** Search Gmail for vendor Recore replies and AI-extract prices onto this RFQ. */
export async function POST(_request: Request, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;

  try {
    const gmail = await checkVendorOutreachThread(id);
    const reparse = await reparseStoredVendorReplies(id);
    return NextResponse.json({
      ok: true,
      ...gmail,
      reparseScanned: reparse.scanned,
      reparseUpdated: reparse.updated,
      reparseResults: reparse.results,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not check vendor replies";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
