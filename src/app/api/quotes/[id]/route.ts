import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { getCompanyConfig } from "@/lib/company";
import { calculateQuoteTotals, type ManualOverrides } from "@/lib/tax";
import { parseQuoteDate } from "@/lib/quote-format";
import { decimalToNumber } from "@/lib/quotes";
import {
  MAX_QUOTE_MONEY,
  MAX_QUOTE_UNIT_PRICE,
} from "@/lib/accounting/money";

const moneyAmount = z.coerce.number().nonnegative().max(MAX_QUOTE_MONEY);
const unitPriceAmount = z.coerce
  .number()
  .nonnegative()
  .max(MAX_QUOTE_UNIT_PRICE, {
    message: `Sell/cost price must be at most ${MAX_QUOTE_UNIT_PRICE}`,
  });

const lineSchema = z.object({
  id: z.string().optional(),
  productId: z.string().nullable().optional(),
  description: z.string().default(""),
  aliasName: z.string().optional().default(""),
  qty: z.coerce.number().nonnegative().max(1_000_000_000),
  unit: z.string().default("nos"),
  unitPrice: unitPriceAmount,
  costPrice: unitPriceAmount.nullable().optional(),
  costVendorName: z.string().optional().default(""),
  discountPercent: z.coerce.number().nonnegative().optional().default(0),
  warrantyQty: z.coerce.number().int().nonnegative().optional().default(0),
  warrantyUnit: z.enum(["years", "months", "days"]).optional().default("years"),
  warrantyService: z.enum(["", "onsite", "offsite", "both"]).optional().default(""),
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
  showHsn: z.boolean().optional(),
  showUnit: z.boolean().optional(),
  gstMode: z.enum(["AUTO", "CGST_SGST", "IGST"]).optional(),
  deliveryCharge: moneyAmount.optional(),
  discountPercent: z.coerce.number().nonnegative().optional(),
  discountAmount: moneyAmount.optional(),
  otherTaxAmount: moneyAmount.optional(),
  otherTaxLabel: z.string().optional(),
  notes: z.string().optional(),
  quoteNumber: z.string().optional(),
  quoteName: z.string().optional(),
  introText: z.string().optional(),
  termsText: z.string().optional(),
  closingText: z.string().optional(),
  quoteDate: z.string().optional(),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED"]).optional(),
  manualOverrides: z.record(z.string(), z.boolean()).optional(),
  subtotal: moneyAmount.optional(),
  gstAmount: moneyAmount.optional(),
  grandTotal: moneyAmount.optional(),
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
    costPrice?: unknown;
    costVendorName?: string;
    discountPercent?: unknown;
    warrantyQty?: number;
    warrantyUnit?: string;
    warrantyService?: string;
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
      costPrice: li.costPrice != null ? decimalToNumber(li.costPrice) : null,
      costVendorName: li.costVendorName || "",
      discountPercent: decimalToNumber(li.discountPercent ?? 0),
      warrantyQty: Number(li.warrantyQty ?? 0) || 0,
      warrantyUnit: li.warrantyUnit || "years",
      warrantyService: li.warrantyService || "",
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
  const [{ error }, { id }, body] = await Promise.all([
    requireSession(),
    params,
    req.json(),
  ]);
  if (error) return error;

  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const company = getCompanyConfig();
  const lineItems = data.lineItems ?? [];
  const overrides = (data.manualOverrides ?? {}) as ManualOverrides;
  const nextNumber = data.quoteNumber?.trim() || "";
  const issuedAt =
    data.quoteDate !== undefined ? parseQuoteDate(data.quoteDate) : undefined;
  const status = data.status ?? null;

  const calc = calculateQuoteTotals({
    lines: lineItems.map((l) => ({
      qty: l.qty,
      unitPrice: l.unitPrice,
      taxRate: l.taxRate,
      discountPercent: l.discountPercent ?? 0,
    })),
    withGst: data.withGst ?? true,
    buyerState: data.buyerState ?? "",
    sellerState: company.sellerState,
    gstMode: data.gstMode ?? "AUTO",
    deliveryCharge: data.deliveryCharge ?? 0,
    discountPercent: data.discountPercent ?? 0,
    discountAmount: data.discountAmount ?? 0,
    otherTaxAmount: data.otherTaxAmount ?? 0,
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

  const linesJson = JSON.stringify(
    lineItems.map((l, i) => ({
      id: l.id || randomUUID(),
      productId: l.productId || null,
      description: l.description || "",
      aliasName: l.aliasName?.trim() || "",
      qty: l.qty,
      unit: l.unit || "pcs",
      unitPrice: l.unitPrice,
      costPrice: l.costPrice && l.costPrice > 0 ? l.costPrice : null,
      costVendorName: l.costVendorName?.trim() || "",
      discountPercent: l.discountPercent ?? 0,
      warrantyQty: l.warrantyQty ?? 0,
      warrantyUnit: l.warrantyUnit ?? "years",
      warrantyService: l.warrantyService ?? "",
      taxRate: l.taxRate,
      lineTotal: calc.lineTotals[i] ?? l.qty * l.unitPrice,
      sortOrder: l.sortOrder ?? i,
    }))
  );

  try {
    const rows = await prisma.$queryRaw<
      Array<{ id: string; quoteNumber: string; status: string }>
    >`
      WITH upd AS (
        UPDATE "Quote"
        SET
          "buyerName" = COALESCE(${data.buyerName}, "buyerName"),
          "buyerCompany" = COALESCE(${data.buyerCompany}, "buyerCompany"),
          "buyerEmail" = COALESCE(${data.buyerEmail}, "buyerEmail"),
          "buyerPhone" = COALESCE(${data.buyerPhone}, "buyerPhone"),
          "buyerState" = COALESCE(${data.buyerState}, "buyerState"),
          "buyerAddress" = COALESCE(${data.buyerAddress}, "buyerAddress"),
          "buyerGstin" = COALESCE(${data.buyerGstin?.trim().toUpperCase() ?? null}, "buyerGstin"),
          "withGst" = COALESCE(${data.withGst}, "withGst"),
          "showHsn" = COALESCE(${data.showHsn}, "showHsn"),
          "gstMode" = COALESCE(${data.gstMode}, "gstMode"),
          "subtotal" = ${calc.subtotal},
          "gstAmount" = ${calc.gstAmount},
          "cgstAmount" = ${calc.cgstAmount},
          "sgstAmount" = ${calc.sgstAmount},
          "igstAmount" = ${calc.igstAmount},
          "otherTaxAmount" = ${calc.otherTaxAmount},
          "otherTaxLabel" = COALESCE(${data.otherTaxLabel}, "otherTaxLabel"),
          "deliveryCharge" = ${calc.deliveryCharge},
          "discountAmount" = ${calc.discountAmount},
          "discountPercent" = COALESCE(${data.discountPercent}, "discountPercent"),
          "grandTotal" = ${calc.grandTotal},
          "manualOverrides" = ${JSON.stringify(overrides)}::jsonb,
          "notes" = COALESCE(${data.notes}, "notes"),
          "quoteNumber" = COALESCE(NULLIF(${nextNumber}, ''), "quoteNumber"),
          "quoteName" = COALESCE(${data.quoteName}, "quoteName"),
          "introText" = COALESCE(${data.introText}, "introText"),
          "termsText" = COALESCE(${data.termsText}, "termsText"),
          "closingText" = COALESCE(${data.closingText}, "closingText"),
          "issuedAt" = COALESCE(${issuedAt}, "issuedAt"),
          "status" = CASE
            WHEN ${status}::text IS NULL THEN "status"
            ELSE CAST(${status} AS "QuoteStatus")
          END,
          "sentAt" = CASE
            WHEN ${status}::text = 'SENT' AND "sentAt" IS NULL THEN NOW()
            ELSE "sentAt"
          END,
          "updatedAt" = NOW()
        WHERE id = ${id}
        RETURNING id, "quoteNumber", status
      ),
      del AS (
        DELETE FROM "QuoteLineItem" WHERE "quoteId" IN (SELECT id FROM upd)
      ),
      ins AS (
        INSERT INTO "QuoteLineItem" (
          "id", "quoteId", "productId", "description", "aliasName",
          "qty", "unit", "unitPrice", "costPrice", "costVendorName",
          "discountPercent", "warrantyQty", "warrantyUnit", "warrantyService",
          "taxRate", "lineTotal", "sortOrder"
        )
        SELECT
          COALESCE(NULLIF(e->>'id', ''), replace(gen_random_uuid()::text, '-', '')),
          (SELECT id FROM upd),
          NULLIF(e->>'productId', ''),
          COALESCE(e->>'description', ''),
          COALESCE(e->>'aliasName', ''),
          COALESCE((e->>'qty')::numeric, 0),
          COALESCE(e->>'unit', 'nos'),
          COALESCE((e->>'unitPrice')::numeric, 0),
          NULLIF(e->>'costPrice', '')::numeric,
          COALESCE(e->>'costVendorName', ''),
          COALESCE((e->>'discountPercent')::numeric, 0),
          COALESCE((e->>'warrantyQty')::int, 0),
          COALESCE(e->>'warrantyUnit', 'years'),
          COALESCE(e->>'warrantyService', ''),
          COALESCE((e->>'taxRate')::numeric, 18),
          COALESCE((e->>'lineTotal')::numeric, 0),
          COALESCE((e->>'sortOrder')::int, 0)
        FROM jsonb_array_elements(${linesJson}::jsonb) AS e
        WHERE EXISTS (SELECT 1 FROM upd)
          AND jsonb_array_length(${linesJson}::jsonb) > 0
      )
      SELECT id, "quoteNumber", status::text AS status FROM upd
    `;

    const quote = rows[0];
    if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (status) {
      try {
        const full = await prisma.quote.findUnique({
          where: { id },
          select: { rfqId: true, status: true },
        });
        if (full?.rfqId) {
          const { syncLeadStageFromQuoteStatus } = await import(
            "@/lib/leads/stage"
          );
          await syncLeadStageFromQuoteStatus({
            rfqId: full.rfqId,
            quoteStatus: full.status,
          });
        }
      } catch {
        // CRM sync best-effort
      }
    }

    return NextResponse.json(quote);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("Quote_quoteNumber_key") || message.includes("quoteNumber")) {
      return NextResponse.json(
        { error: "That ref no is already used by another quote" },
        { status: 400 }
      );
    }
    if (
      /numeric|decimal|overflow|out of range|value too long/i.test(message)
    ) {
      return NextResponse.json(
        { error: "One or more amounts are too large to save" },
        { status: 400 }
      );
    }
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  await prisma.quote.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
