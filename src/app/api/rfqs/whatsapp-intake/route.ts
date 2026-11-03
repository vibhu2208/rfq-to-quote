import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { ingestWhatsAppInboundMessage } from "@/lib/whatsapp-inbox";
import { messageLooksLikeRequirement } from "@/lib/inbound-requirement";

const bodySchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  from: z.string().trim().min(8).max(24).optional().default(""),
  name: z.string().trim().max(120).optional().default(""),
  messageId: z.string().trim().max(120).optional(),
});

/**
 * Manual WhatsApp → inbox intake (when Meta webhook cannot reach this app,
 * e.g. local dev). Only requirement-like messages are accepted.
 */
export async function POST(request: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const text = parsed.data.text.trim();
  if (!messageLooksLikeRequirement(text)) {
    return NextResponse.json(
      {
        error:
          "That message does not look like a product requirement. Include what you need (e.g. product name / qty).",
      },
      { status: 400 }
    );
  }

  const fromDigits = (parsed.data.from || "").replace(/[^\d]/g, "") || "0000000000";
  const result = await ingestWhatsAppInboundMessage({
    messageId:
      parsed.data.messageId?.trim() ||
      `wa-manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from: fromDigits,
    name: parsed.data.name.trim() || "WhatsApp customer",
    text,
    timestamp: String(Math.floor(Date.now() / 1000)),
  });

  if (result.kind !== "rfq" || !result.rfq) {
    return NextResponse.json(
      {
        error:
          result.reason ||
          (result.kind === "duplicate"
            ? "This WhatsApp message was already imported."
            : "Could not import WhatsApp message."),
        kind: result.kind,
      },
      { status: result.kind === "duplicate" ? 409 : 400 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      id: result.rfq.id,
      status: result.rfq.status,
      subject: result.rfq.subject,
    },
    { status: 201 }
  );
}
