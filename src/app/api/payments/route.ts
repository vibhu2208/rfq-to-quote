import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { requireUserId } from "@/lib/api/session-user";
import { createReceipt, serializePayment } from "@/lib/accounting/payments";
import { isAccountingError } from "@/lib/accounting/errors";

const allocationSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive(),
});

const createSchema = z.object({
  partyId: z.string().min(1),
  accountId: z.string().optional(),
  method: z
    .enum(["CASH", "BANK_TRANSFER", "UPI", "CARD", "CHEQUE", "DEMAND_DRAFT", "OTHER"])
    .optional(),
  paymentDate: z.string().optional(),
  amount: z.coerce.number().positive(),
  reference: z.string().optional(),
  idempotencyKey: z.string().optional(),
  allocations: z.array(allocationSchema).min(1),
});

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const partyId = new URL(req.url).searchParams.get("partyId");

  const payments = await prisma.payment.findMany({
    where: {
      direction: "RECEIPT",
      ...(partyId ? { partyId } : {}),
    },
    include: {
      party: { select: { id: true, code: true, legalName: true } },
      account: { select: { id: true, code: true, name: true } },
      allocations: {
        include: { invoice: { select: { id: true, number: true, status: true } } },
      },
    },
    orderBy: { paymentDate: "desc" },
  });

  return NextResponse.json(payments.map(serializePayment));
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
    const payment = await createReceipt({
      partyId: parsed.data.partyId,
      accountId: parsed.data.accountId,
      method: parsed.data.method,
      paymentDate: parsed.data.paymentDate ? new Date(parsed.data.paymentDate) : undefined,
      amount: parsed.data.amount,
      reference: parsed.data.reference,
      idempotencyKey: parsed.data.idempotencyKey,
      allocations: parsed.data.allocations,
      userId,
    });

    return NextResponse.json(serializePayment(payment), { status: 201 });
  } catch (err) {
    if (isAccountingError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    throw err;
  }
}
