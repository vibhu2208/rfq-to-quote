import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { getCompanyConfig } from "@/lib/company";
import { calculateQuoteTotals, type ManualOverrides } from "@/lib/tax";
import { decimalToNumber } from "@/lib/quotes";

const lineSchema = z.object({
  id: z.string().optional(),
  productId: z.string().nullable().optional(),
  description: z.string().default(""),
  aliasName: z.string().optional().default(""),
  qty: z.coerce.number().positive(),
  unit: z.string().default("pcs"),
  unitPrice: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().nonnegative().default(18),
  sortOrder: z.coerce.number().int().optional().default(0),
});

const quoteSchema = z.object({
  buyerName: z.string().optional(),
  buyerCompany: z.string().optional(),
  buyerEmail: z.string().optional(),
  buyerPhone: z.string().optional(),
  buyerState: z.string().optional(),
  buyerAddress: z.string().optional(),
  buyerGstin: z.string().optional(),
  withGst: z.boolean().optional(),
  gstMode: z.enum(["AUTO", "CGST_SGST", "IGST"]).optional(),
  deliveryCharge: z.coerce.number().nonnegative().optional(),
  discountPercent: z.coerce.number().nonnegative().optional(),
  discountAmount: z.coerce.number().nonnegative().optional(),
  otherTaxAmount: z.coerce.number().nonnegative().optional(),
  otherTaxLabel: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED"]).optional(),
  manualOverrides: z.record(z.string(), z.boolean()).optional(),
  subtotal: z.coerce.number().optional(),
  gstAmount: z.coerce.number().optional(),
  grandTotal: z.coerce.number().optional(),
  lineItems: z.array(lineSchema).optional(),
});

function serializeQuote(quote: {
  id: string;
  quoteNumber: string;
  status: string;
  version: number;
  buyerName: string;
  buyerCompany: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerState: string;
  buyerAddress: string;
  buyerGstin: string;
  withGst: boolean;
  gstMode: string;
  subtotal: unknown;
  gstAmount: unknown;
  cgstAmount: unknown;
  sgstAmount: unknown;
  igstAmount: unknown;
  otherTaxAmount: unknown;
  otherTaxLabel: string;
  deliveryCharge: unknown;
  discountAmount: unknown;
  discountPercent: unknown;
  grandTotal: unknown;
  manualOverrides: unknown;
  notes: string;
  validUntil: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lineItems?: Array<{
    id: string;
    productId: string | null;
    description: string;
    aliasName: string;
    qty: unknown;
    unit: string;
    unitPrice: unknown;
    taxRate: unknown;
    lineTotal: unknown;
    sortOrder: number;
    product?: { id: string; code: string; name: string } | null;
  }>;
}) {
  return {
    ...quote,
    subtotal: decimalToNumber(quote.subtotal),
    gstAmount: decimalToNumber(quote.gstAmount),
    cgstAmount: decimalToNumber(quote.cgstAmount),
    sgstAmount: decimalToNumber(quote.sgstAmount),
    igstAmount: decimalToNumber(quote.igstAmount),
    otherTaxAmount: decimalToNumber(quote.otherTaxAmount),
    deliveryCharge: decimalToNumber(quote.deliveryCharge),
    discountAmount: decimalToNumber(quote.discountAmount),
    discountPercent: decimalToNumber(quote.discountPercent),
    grandTotal: decimalToNumber(quote.grandTotal),
    lineItems: (quote.lineItems || []).map((li) => ({
      ...li,
      aliasName: li.aliasName || "",
      qty: decimalToNumber(li.qty),
      unitPrice: decimalToNumber(li.unitPrice),
      taxRate: decimalToNumber(li.taxRate),
      lineTotal: decimalToNumber(li.lineTotal),
    })),
  };
}

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      lineItems: {
        include: { product: { select: { id: true, code: true, name: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(serializeQuote(quote));
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const company = getCompanyConfig();
  const lineItems = data.lineItems ?? [];
  const overrides = (data.manualOverrides ?? existing.manualOverrides ?? {}) as ManualOverrides;

  const calc = calculateQuoteTotals({
    lines: lineItems.map((l) => ({
      qty: l.qty,
      unitPrice: l.unitPrice,
      taxRate: l.taxRate,
    })),
    withGst: data.withGst ?? existing.withGst,
    buyerState: data.buyerState ?? existing.buyerState,
    sellerState: company.sellerState,
    gstMode: data.gstMode ?? (existing.gstMode as "AUTO" | "CGST_SGST" | "IGST"),
    deliveryCharge: data.deliveryCharge ?? decimalToNumber(existing.deliveryCharge),
    discountPercent: data.discountPercent ?? decimalToNumber(existing.discountPercent),
    discountAmount: data.discountAmount ?? decimalToNumber(existing.discountAmount),
    otherTaxAmount: data.otherTaxAmount ?? decimalToNumber(existing.otherTaxAmount),
    overrides,
    previous: {
      subtotal: data.subtotal ?? decimalToNumber(existing.subtotal),
      gstAmount: data.gstAmount ?? decimalToNumber(existing.gstAmount),
      cgstAmount: decimalToNumber(existing.cgstAmount),
      sgstAmount: decimalToNumber(existing.sgstAmount),
      igstAmount: decimalToNumber(existing.igstAmount),
      otherTaxAmount: data.otherTaxAmount ?? decimalToNumber(existing.otherTaxAmount),
      deliveryCharge: data.deliveryCharge ?? decimalToNumber(existing.deliveryCharge),
      discountAmount: data.discountAmount ?? decimalToNumber(existing.discountAmount),
      grandTotal: data.grandTotal ?? decimalToNumber(existing.grandTotal),
    },
  });

  const status = data.status ?? existing.status;
  const becameSent = status === "SENT" && !existing.sentAt;

  const quote = await prisma.$transaction(async (tx) => {
    await tx.quoteLineItem.deleteMany({ where: { quoteId: id } });

    return tx.quote.update({
      where: { id },
      data: {
        buyerName: data.buyerName ?? existing.buyerName,
        buyerCompany: data.buyerCompany ?? existing.buyerCompany,
        buyerEmail: data.buyerEmail ?? existing.buyerEmail,
        buyerPhone: data.buyerPhone ?? existing.buyerPhone,
        buyerState: data.buyerState ?? existing.buyerState,
        buyerAddress: data.buyerAddress ?? existing.buyerAddress,
        buyerGstin:
          data.buyerGstin !== undefined
            ? data.buyerGstin.trim().toUpperCase()
            : existing.buyerGstin,
        withGst: data.withGst ?? existing.withGst,
        gstMode: data.gstMode ?? existing.gstMode,
        subtotal: calc.subtotal,
        gstAmount: calc.gstAmount,
        cgstAmount: calc.cgstAmount,
        sgstAmount: calc.sgstAmount,
        igstAmount: calc.igstAmount,
        otherTaxAmount: calc.otherTaxAmount,
        otherTaxLabel: data.otherTaxLabel ?? existing.otherTaxLabel,
        deliveryCharge: calc.deliveryCharge,
        discountAmount: calc.discountAmount,
        discountPercent: data.discountPercent ?? existing.discountPercent,
        grandTotal: calc.grandTotal,
        manualOverrides: overrides,
        notes: data.notes ?? existing.notes,
        status,
        sentAt: becameSent ? new Date() : existing.sentAt,
        lineItems: {
          create: lineItems.map((l, i) => ({
            productId: l.productId || null,
            description: l.description,
            aliasName: l.aliasName?.trim() || "",
            qty: l.qty,
            unit: l.unit,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
            lineTotal: calc.lineTotals[i] ?? l.qty * l.unitPrice,
            sortOrder: l.sortOrder ?? i,
          })),
        },
      },
      include: {
        lineItems: {
          include: { product: { select: { id: true, code: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
  });

  return NextResponse.json(serializeQuote(quote));
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  await prisma.quote.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
