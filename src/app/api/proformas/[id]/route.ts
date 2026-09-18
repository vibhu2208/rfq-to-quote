import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { requireUserId } from "@/lib/api/session-user";
import {
  convertProformaToTaxInvoice,
  issueProforma,
  recordProformaPayment,
  serializeProforma,
  serializeInvoice,
} from "@/lib/accounting/invoices";
import { isAccountingError } from "@/lib/accounting/errors";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("issue"),
  }),
  z.object({
    action: z.literal("convert"),
    warehouseId: z.string().optional(),
  }),
  z.object({
    action: z.literal("record_payment"),
    amount: z.coerce.number().positive(),
    method: z
      .enum(["CASH", "BANK_TRANSFER", "UPI", "CARD", "CHEQUE", "DEMAND_DRAFT", "OTHER"])
      .optional(),
    reference: z.string().optional(),
  }),
]);

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const proforma = await prisma.proformaInvoice.findUnique({
    where: { id },
    include: {
      lines: { include: { product: { select: { id: true, code: true, name: true } } } },
      party: true,
      quote: { select: { id: true, quoteNumber: true, status: true } },
      invoices: { select: { id: true, number: true, status: true } },
    },
  });

  if (!proforma) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(serializeProforma(proforma));
}

export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { userId, error: userError } = requireUserId(session);
  if (userError) return userError;

  const { id } = await params;
  const body = await req.json();
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.action === "issue") {
      const proforma = await issueProforma(id, userId);
      return NextResponse.json(serializeProforma(proforma));
    }
    if (parsed.data.action === "record_payment") {
      const proforma = await recordProformaPayment(id, {
        amount: parsed.data.amount,
        method: parsed.data.method,
        reference: parsed.data.reference,
        userId,
      });
      return NextResponse.json(serializeProforma(proforma));
    }

    const invoice = await convertProformaToTaxInvoice(id, userId, {
      warehouseId: parsed.data.warehouseId,
    });
    return NextResponse.json(serializeInvoice(invoice), { status: 201 });
  } catch (err) {
    if (isAccountingError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
