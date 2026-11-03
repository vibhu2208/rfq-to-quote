import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { previewVendorRecore, sendVendorRecore } from "@/lib/vendor-outreach";

type Params = { params: Promise<{ id: string; vendorId: string }> };

const bodySchema = z.object({
  productKey: z.string().trim().max(200).optional(),
  lineNumbers: z.array(z.number().int().positive()).max(200).optional(),
  contactIds: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  toEmails: z.array(z.string().trim().email().max(254)).max(50).optional(),
  toPhones: z.array(z.string().trim().min(8).max(24)).max(50).optional(),
  channel: z.enum(["EMAIL", "WHATSAPP"]).optional().default("EMAIL"),
  subject: z.string().max(500).optional(),
  body: z.string().max(50_000).optional(),
  preview: z.boolean().optional(),
});

/** Preview or send a Recore quote-request (email or WhatsApp). */
export async function POST(request: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, vendorId } = await params;
  const json = await request.json().catch(() => null);
  if (json == null || typeof json !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const isPreview = Boolean(parsed.data.preview);
  const channel = parsed.data.channel === "WHATSAPP" ? "WHATSAPP" : "EMAIL";

  if (!isPreview) {
    if (!parsed.data.body?.trim()) {
      return NextResponse.json(
        { error: "Message body is required." },
        { status: 400 }
      );
    }
    if (channel === "EMAIL" && !parsed.data.subject?.trim()) {
      return NextResponse.json(
        { error: "Subject and email body are required." },
        { status: 400 }
      );
    }
    const hasRecipients =
      (parsed.data.contactIds && parsed.data.contactIds.length > 0) ||
      (channel === "EMAIL"
        ? parsed.data.toEmails && parsed.data.toEmails.length > 0
        : parsed.data.toPhones && parsed.data.toPhones.length > 0);
    if (!hasRecipients) {
      return NextResponse.json(
        {
          error:
            channel === "WHATSAPP"
              ? "Select at least one WhatsApp contact."
              : "Select at least one POC or recipient email.",
        },
        { status: 400 }
      );
    }
  }

  try {
    if (isPreview) {
      const draft = await previewVendorRecore({
        rfqId: id,
        vendorId,
        productKey: parsed.data.productKey,
        lineNumbers: parsed.data.lineNumbers,
        contactIds: parsed.data.contactIds,
      });
      return NextResponse.json({
        subject: draft.subject,
        body: draft.body,
        threadRef: draft.threadRef,
        preferredChannel: draft.vendor.preferredChannel,
        whatsappId: draft.vendor.whatsappId || "",
        phone: draft.vendor.phone || "",
        contacts: draft.contacts.map((contact) => ({
          id: contact.id,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          role: contact.role,
          isPrimary: contact.isPrimary,
        })),
        recipients: draft.recipients.map((contact) => ({
          id: contact.id,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
        })),
      });
    }

    const outreach = await sendVendorRecore({
      rfqId: id,
      vendorId,
      productKey: parsed.data.productKey,
      lineNumbers: parsed.data.lineNumbers,
      contactIds: parsed.data.contactIds,
      toEmails: parsed.data.toEmails,
      toPhones: parsed.data.toPhones,
      channel,
      subject: parsed.data.subject,
      body: parsed.data.body,
    });

    if (outreach.status === "FAILED") {
      return NextResponse.json(
        {
          error:
            outreach.errorMessage ||
            (channel === "WHATSAPP"
              ? "Failed to send WhatsApp"
              : "Failed to send email"),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      id: outreach.id,
      status: outreach.status,
      channel,
      threadRef: outreach.threadRef,
      sentAt: outreach.sentAt?.toISOString() || null,
      outboundMsgId: outreach.outboundMsgId,
      requestedLineNumbers: Array.isArray(outreach.requestedLineNumbers)
        ? outreach.requestedLineNumbers
        : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Recore failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
