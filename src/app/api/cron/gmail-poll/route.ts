import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { pollGmailInbox } from "@/lib/gmail-imap";

function authorize(req: NextRequest): boolean {
  const expected = process.env.GMAIL_POLL_SECRET;
  const fromQuery = req.nextUrl.searchParams.get("secret");
  const fromHeader = req.headers.get("x-gmail-poll-secret");
  if (expected && (fromQuery === expected || fromHeader === expected)) return true;
  return false;
}

/**
 * Poll Gmail INBOX for unread mail and create RFQs.
 * Auth: logged-in session OR ?secret=GMAIL_POLL_SECRET
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user && !authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") || 20);
    const includeExisting = req.nextUrl.searchParams.get("includeExisting") === "true";
    const result = await pollGmailInbox({ limit, includeExisting });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gmail poll failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
