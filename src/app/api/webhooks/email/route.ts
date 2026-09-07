import { NextRequest, NextResponse } from "next/server";
import { createRfqWithMessage, resolveEmailChannel } from "@/lib/rfq";

/**
 * Inbound email webhook compatible with:
 * - Postmark Inbound (JSON)
 * - SendGrid Inbound Parse (multipart form)
 * - Manual/dev JSON POST for testing
 *
 * Secure with EMAIL_WEBHOOK_SECRET query param or header:
 *   ?secret=...  or  x-webhook-secret: ...
 */
function authorize(req: NextRequest): boolean {
  const expected = process.env.EMAIL_WEBHOOK_SECRET;
  if (!expected) return true; // allow in local/dev if unset
  const fromQuery = req.nextUrl.searchParams.get("secret");
  const fromHeader = req.headers.get("x-webhook-secret");
  return fromQuery === expected || fromHeader === expected;
}

function parseAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].replace(/"/g, "").trim(), email: match[2].trim() };
  }
  if (raw.includes("@")) return { name: "", email: raw.trim() };
  return { name: raw.trim(), email: "" };
}

type NormalizedEmail = {
  fromName: string;
  fromEmail: string;
  subject: string;
  text: string;
  messageId: string;
  attachments: Array<{ name: string; contentType?: string }>;
};

async function normalizePayload(req: NextRequest): Promise<NormalizedEmail | null> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    // SendGrid Inbound Parse
    const from = String(form.get("from") || form.get("From") || "");
    const subject = String(form.get("subject") || form.get("Subject") || "");
    const text = String(form.get("text") || form.get("plain") || form.get("TextBody") || "");
    const html = String(form.get("html") || form.get("HtmlBody") || "");
    const messageId = String(form.get("headers") || form.get("Message-Id") || form.get("messageId") || Date.now());
    const { name, email } = parseAddress(from);
    return {
      fromName: name,
      fromEmail: email,
      subject,
      text: text || html.replace(/<[^>]+>/g, " ").slice(0, 20000),
      messageId: String(messageId).slice(0, 200),
      attachments: [],
    };
  }

  const json = await req.json();

  // Postmark Inbound
  if (json.FromFull || json.TextBody || json.From) {
    const fromEmail = json.FromFull?.Email || parseAddress(String(json.From || "")).email;
    const fromName = json.FromFull?.Name || parseAddress(String(json.From || "")).name;
    const attachments = Array.isArray(json.Attachments)
      ? json.Attachments.map((a: { Name?: string; ContentType?: string }) => ({
          name: a.Name || "attachment",
          contentType: a.ContentType,
        }))
      : [];
    return {
      fromName: fromName || "",
      fromEmail: fromEmail || "",
      subject: String(json.Subject || ""),
      text: String(json.TextBody || json.HtmlBody || "").replace(/<[^>]+>/g, " "),
      messageId: String(json.MessageID || json.MessageId || Date.now()),
      attachments,
    };
  }

  // Dev / generic
  if (json.text || json.body || json.rawText) {
    const { name, email } = parseAddress(String(json.from || json.fromEmail || ""));
    return {
      fromName: json.fromName || name,
      fromEmail: json.fromEmail || email,
      subject: String(json.subject || ""),
      text: String(json.text || json.body || json.rawText || ""),
      messageId: String(json.messageId || json.sourceRef || Date.now()),
      attachments: Array.isArray(json.attachments) ? json.attachments : [],
    };
  }

  return null;
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const email = await normalizePayload(req);
    if (!email || !email.text.trim()) {
      return NextResponse.json({ error: "Unrecognized or empty email payload" }, { status: 400 });
    }

    const channel = resolveEmailChannel(email.fromEmail);
    const rfq = await createRfqWithMessage({
      channel,
      sourceRef: email.messageId,
      subject: email.subject,
      rawText: email.text.trim(),
      rawAttachments: email.attachments,
      customerName: email.fromName,
      customerEmail: email.fromEmail,
    });

    return NextResponse.json({ ok: true, rfqId: rfq.id, status: rfq.status, channel });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Webhook failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Health check for providers that probe the URL */
export async function GET() {
  return NextResponse.json({ ok: true, service: "email-inbound" });
}
