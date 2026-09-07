import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { getCompanyConfig } from "@/lib/company";
import { calculateQuoteTotals, type ManualOverrides } from "@/lib/tax";
import { decimalToNumber, nextQuoteNumber } from "@/lib/quotes";

const lineSchema = z.object({
  id: z.string().optional(),
  productId: z.string().nullable().optional(),
  description: z.string().default(""),
  qty: z.coerce.number().positive(),
  unit: z.string().default("pcs"),
  unitPrice: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().nonnegative().default(18),
  sortOrder: z.coerce.number().int().optional().default(0),
});

const quoteSchema = z.object({
  buyerName: z.string().optional().default(""),
  buyerCompany: z.string().optional().default(""),
  buyerEmail: z.string().optional().default(""),
  buyerPhone: z.string().optional().default(""),
  buyerState: z.string().optional().default(""),
  buyerAddress: z.string().optional().default(""),
  withGst: z.boolean().optional().default(true),
  gstMode: z.enum(["AUTO", "CGST_SGST", "IGST"]).optional().default("AUTO"),
  deliveryCharge: z.coerce.number().nonnegative().optional().default(0),
  discountPercent: z.coerce.number().nonnegative().optional().default(0),
  discountAmount: z.coerce.number().nonnegative().optional().default(0),
  otherTaxAmount: z.coerce.number().nonnegative().optional().default(0),
  otherTaxLabel: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  status: z.enum(["DRAFT", "SENT"]).optional().default("DRAFT"),
  manualOverrides: z.record(z.string(), z.boolean()).optional().default({}),
  // Manual total overrides (when flagged)
  subtotal: z.coerce.number().optional(),
  gstAmount: z.coerce.number().optional(),
  grandTotal: z.coerce.number().optional(),
  lineItems: z.array(lineSchema).default([]),
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
      qty: decimalToNumber(li.qty),
      unitPrice: decimalToNumber(li.unitPrice),
      taxRate: decimalToNumber(li.taxRate),
      lineTotal: decimalToNumber(li.lineTotal),
    })),
  };
}

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const status = new URL(req.url).searchParams.get("status");
  const quotes = await prisma.quote.findMany({
    where: status ? { status: status as "DRAFT" } : undefined,
    include: {
      lineItems: {
        include: { product: { select: { id: true, code: true, name: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(quotes.map(serializeQuote));
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const company = getCompanyConfig();
  const overrides = (data.manualOverrides || {}) as ManualOverrides;

  const calc = calculateQuoteTotals({
    lines: data.lineItems.map((l) => ({
      qty: l.qty,
      unitPrice: l.unitPrice,
      taxRate: l.taxRate,
    })),
    withGst: data.withGst,
    buyerState: data.buyerState,
    sellerState: company.sellerState,
    gstMode: data.gstMode,
    deliveryCharge: data.deliveryCharge,
    discountPercent: data.discountPercent,
    discountAmount: data.discountAmount,
    otherTaxAmount: data.otherTaxAmount,
    overrides,
    previous: {
      subtotal: data.subtotal,
      gstAmount: data.gstAmount,
      otherTaxAmount: data.otherTaxAmount,
      deliveryCharge: data.deliveryCharge,
      discountAmount: data.discountAmount,
      grandTotal: data.grandTotal,
    },
  });

  const quoteNumber = await nextQuoteNumber();

  const quote = await prisma.quote.create({
    data: {
      quoteNumber,
      status: data.status,
      buyerName: data.buyerName,
      buyerCompany: data.buyerCompany,
      buyerEmail: data.buyerEmail,
      buyerPhone: data.buyerPhone,
      buyerState: data.buyerState,
      buyerAddress: data.buyerAddress,
      withGst: data.withGst,
      gstMode: data.gstMode,
      subtotal: calc.subtotal,
      gstAmount: calc.gstAmount,
      cgstAmount: calc.cgstAmount,
      sgstAmount: calc.sgstAmount,
      igstAmount: calc.igstAmount,
      otherTaxAmount: calc.otherTaxAmount,
      otherTaxLabel: data.otherTaxLabel,
      deliveryCharge: calc.deliveryCharge,
      discountAmount: calc.discountAmount,
      discountPercent: data.discountPercent,
      grandTotal: calc.grandTotal,
      manualOverrides: overrides,
      notes: data.notes,
      sentAt: data.status === "SENT" ? new Date() : null,
      lineItems: {
        create: data.lineItems.map((l, i) => ({
          productId: l.productId || null,
          description: l.description,
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

  return NextResponse.json(serializeQuote(quote), { status: 201 });
}
