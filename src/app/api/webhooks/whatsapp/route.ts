import { NextRequest, NextResponse } from "next/server";
import { ingestWhatsAppWebhookPayload } from "@/lib/whatsapp-inbox";

export const dynamic = "force-dynamic";

function expectedVerifyToken(): string {
  return (
    process.env.WHATSAPP_VERIFY_TOKEN?.trim() ||
    process.env.WHATSAPP_WEBHOOK_SECRET?.trim() ||
    ""
  );
}

/** Meta webhook verification challenge. */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const expected = expectedVerifyToken();

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  return NextResponse.json({ ok: true, service: "whatsapp-inbound" });
}

/**
 * Inbound WhatsApp messages from Meta / iDiary.
 * Only product-requirement messages become RFQs; vendor Recore replies are routed separately.
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const result = await ingestWhatsAppWebhookPayload(payload);

    return NextResponse.json({
      ok: true,
      received: result.received,
      created: result.created,
      skipped: result.skipped,
      vendorReplies: result.vendorReplies,
      duplicates: result.duplicates,
      rfqs: result.results
        .filter((row) => row.kind === "rfq" && row.rfq)
        .map((row) => ({
          id: row.rfq!.id,
          status: row.rfq!.status,
          from: row.from,
        })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Webhook failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
