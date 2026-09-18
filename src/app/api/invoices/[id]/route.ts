import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { requireUserId } from "@/lib/api/session-user";
import {
  cancelInvoice,
  issueTaxInvoice,
  serializeInvoice,
} from "@/lib/accounting/invoices";
import { isAccountingError } from "@/lib/accounting/errors";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("issue"),
    warehouseId: z.string().optional(),
  }),
  z.object({
    action: z.literal("cancel"),
    reason: z.string().min(1),
  }),
]);

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      lines: { include: { product: { select: { id: true, code: true, name: true } } } },
      party: true,
      proformaInvoice: { select: { id: true, number: true, quoteId: true } },
      paymentAllocations: { include: { payment: true } },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(serializeInvoice(invoice));
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
      const invoice = await issueTaxInvoice(id, userId, {
        warehouseId: parsed.data.warehouseId,
      });
      return NextResponse.json(serializeInvoice(invoice));
    }

    const invoice = await cancelInvoice(id, userId, parsed.data.reason);
    return NextResponse.json(serializeInvoice(invoice));
  } catch (err) {
    if (isAccountingError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    throw err;
  }
}
