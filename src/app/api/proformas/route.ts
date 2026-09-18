import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { requireUserId } from "@/lib/api/session-user";
import {
  createProformaFromQuote,
  serializeProforma,
} from "@/lib/accounting/invoices";
import { isAccountingError } from "@/lib/accounting/errors";

const createSchema = z.object({
  quoteId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  void session;
  const status = new URL(req.url).searchParams.get("status");

  const proformas = await prisma.proformaInvoice.findMany({
    where: status ? { status: status as "DRAFT" | "ISSUED" | "CANCELLED" } : undefined,
    include: {
      lines: { include: { product: { select: { id: true, code: true, name: true } } } },
      party: true,
      quote: { select: { id: true, quoteNumber: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(proformas.map(serializeProforma));
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { userId, error: userError } = requireUserId(session);
  if (userError) return userError;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const proforma = await createProformaFromQuote(parsed.data.quoteId, userId);
    return NextResponse.json(serializeProforma(proforma), { status: 201 });
  } catch (err) {
    if (isAccountingError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("POST /api/proformas failed", err);
    const message = err instanceof Error ? err.message : "Failed to create proforma";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
