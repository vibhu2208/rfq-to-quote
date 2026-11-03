import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pollGmailInbox } from "@/lib/gmail-imap";
import { pollWhatsAppInbox } from "@/lib/whatsapp-inbox";

function authorize(req: NextRequest): boolean {
  const expected =
    process.env.MAIL_POLL_SECRET || process.env.GMAIL_POLL_SECRET;
  const fromQuery = req.nextUrl.searchParams.get("secret");
  const fromHeader =
    req.headers.get("x-mail-poll-secret") ||
    req.headers.get("x-gmail-poll-secret");
  if (expected && (fromQuery === expected || fromHeader === expected)) return true;
  return false;
}

/**
 * Poll Outlook/Gmail + refresh WhatsApp inbox status.
 * WhatsApp RFQs arrive via webhook; only requirement-like messages are kept.
 * Auth: logged-in session OR ?secret=MAIL_POLL_SECRET
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user && !authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") || 20);
    const includeExisting =
      req.nextUrl.searchParams.get("includeExisting") === "true";

    let payload: unknown = undefined;
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => null);
      if (body && typeof body === "object" && "entry" in body) {
        payload = body;
      } else if (
        body &&
        typeof body === "object" &&
        "whatsappPayload" in body
      ) {
        payload = (body as { whatsappPayload?: unknown }).whatsappPayload;
      }
    }

    const [email, whatsapp] = await Promise.all([
      pollGmailInbox({ limit, includeExisting }).catch((error) => ({
        error: error instanceof Error ? error.message : "Outlook poll failed",
      })),
      pollWhatsAppInbox({ limit, payload }),
    ]);

    const emailOk = !("error" in email);
    const emailCreated = emailOk ? email.created : 0;
    const whatsappCreated = whatsapp.created;

    return NextResponse.json({
      ok: emailOk || whatsapp.available || whatsapp.created > 0,
      fetched:
        (emailOk ? email.fetched : 0) + (whatsapp.fetched || 0),
      created: emailCreated + whatsappCreated,
      email: emailOk
        ? email
        : { error: "error" in email ? email.error : "Outlook poll failed" },
      whatsapp,
      // Flat fields kept for older inbox UI that only read Outlook stats.
      ...(emailOk
        ? {
            skipped: email.skipped,
            vendorReplies: email.vendorReplies,
            quoteReplies: email.quoteReplies,
            initialized: email.initialized,
            lastSeenUid: email.lastSeenUid,
            rfqs: email.rfqs,
          }
        : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Inbox poll failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
