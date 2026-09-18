import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { requireUserId } from "@/lib/api/session-user";
import { prisma } from "@/lib/prisma";
import { checkQuoteEmailThread } from "@/lib/gmail-imap";
import { getQuoteLifecycle, sendQuoteFollowUpEmail } from "@/lib/quote-thread";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const lifecycle = await getQuoteLifecycle(id);
  if (!lifecycle) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  return NextResponse.json(lifecycle);
}

const assistSchema = z.object({
  action: z.enum(["clear_assistance", "send_reply", "check_thread"]),
  body: z.string().optional(),
  subject: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { userId } = requireUserId(session);

  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const parsed = assistSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.action === "clear_assistance") {
    await prisma.quote.update({
      where: { id },
      data: { needsAssistance: false, assistanceReason: "" },
    });
    const lifecycle = await getQuoteLifecycle(id);
    return NextResponse.json({ ok: true, lifecycle });
  }

  if (parsed.data.action === "check_thread") {
    try {
      const check = await checkQuoteEmailThread(id);
      const lifecycle = await getQuoteLifecycle(id);
      return NextResponse.json({ ok: true, check, lifecycle });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Thread check failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  try {
    const sent = await sendQuoteFollowUpEmail({
      quoteId: id,
      body: parsed.data.body || "",
      subject: parsed.data.subject,
      createdById: userId ?? undefined,
    });
    const lifecycle = await getQuoteLifecycle(id);
    return NextResponse.json({ ok: true, messageId: sent.messageId, lifecycle });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
