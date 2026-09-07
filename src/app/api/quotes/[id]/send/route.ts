import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { resolveQuoteSendDefaults } from "@/lib/quote-send-defaults";
import { sendQuoteToBuyer } from "@/lib/quote-send";

type Params = { params: Promise<{ id: string }> };

const sendSchema = z.object({
  channel: z.enum(["EMAIL", "WHATSAPP"]),
  to: z.string().min(1, "Destination is required"),
  note: z.string().optional(),
});

/** Suggested channel/destination for the send UI. */
export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const quote = await prisma.quote.findUnique({
    where: { id },
    select: {
      buyerEmail: true,
      buyerPhone: true,
      rfq: {
        select: {
          channel: true,
          customerEmail: true,
          customerPhone: true,
        },
      },
    },
  });

  if (!quote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const defaults = resolveQuoteSendDefaults({
    rfqChannel: quote.rfq?.channel ?? null,
    buyerEmail: quote.buyerEmail,
    buyerPhone: quote.buyerPhone,
    customerEmail: quote.rfq?.customerEmail,
    customerPhone: quote.rfq?.customerPhone,
  });

  return NextResponse.json(defaults);
}

/** Send the quote PDF to the buyer via email (WhatsApp later). */
export async function POST(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid request" },
      { status: 400 }
    );
  }

  try {
    const result = await sendQuoteToBuyer({
      quoteId: id,
      channel: parsed.data.channel,
      to: parsed.data.to,
      note: parsed.data.note,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    const status =
      message.includes("not configured") || message.includes("not found")
        ? message.includes("not found")
          ? 404
          : 501
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
