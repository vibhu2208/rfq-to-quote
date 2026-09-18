import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { requireUserId } from "@/lib/api/session-user";
import {
  convertProformaToTaxInvoice,
  serializeInvoice,
} from "@/lib/accounting/invoices";
import { isAccountingError } from "@/lib/accounting/errors";

const createSchema = z.object({
  proformaId: z.string().min(1),
  warehouseId: z.string().optional(),
  issue: z.boolean().optional().default(true),
});

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const status = new URL(req.url).searchParams.get("status");

  const invoices = await prisma.invoice.findMany({
    where: status
      ? { status: status as "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED" }
      : undefined,
    include: {
      lines: { include: { product: { select: { id: true, code: true, name: true } } } },
      party: true,
      proformaInvoice: { select: { id: true, number: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(invoices.map(serializeInvoice));
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { userId, error: userError } = requireUserId(session);
  if (userError) return userError;

  const body = await req.json();
  if (body?.quoteId && !body?.proformaId) {
    return NextResponse.json(
      {
        error:
          "Direct tax invoices from quotes are disabled. Create a proforma first, record payment, then convert.",
        code: "PROFORMA_REQUIRED",
      },
      { status: 400 }
    );
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const invoice = await convertProformaToTaxInvoice(parsed.data.proformaId, userId, {
      warehouseId: parsed.data.warehouseId,
      issue: parsed.data.issue,
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
