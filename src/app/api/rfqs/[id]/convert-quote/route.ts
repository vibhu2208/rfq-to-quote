import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { nextQuoteNumber, decimalToNumber } from "@/lib/quotes";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  productIds: z.array(z.string()).optional(),
  /** qty override per product id */
  quantities: z.record(z.string(), z.number().positive()).optional(),
});

/**
 * Creates a draft quote from RFQ.
 * If productIds provided, uses matched catalog products (offer prices).
 * Otherwise falls back to a single text line from parsed specs.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const rfq = await prisma.rfq.findUnique({ where: { id } });
  if (!rfq) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let productIds: string[] = [];
  let quantities: Record<string, number> = {};
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (parsed.success) {
      productIds = parsed.data.productIds || [];
      quantities = parsed.data.quantities || {};
    }
  } catch {
    // empty body ok
  }

  const specs = rfq.parsedSpecs as Record<string, unknown> | null;
  const meta = (specs?._meta as { summary?: string } | undefined) || {};
  const defaultQty =
    typeof specs?.quantity === "number" && specs.quantity > 0 ? specs.quantity : 1;

  const quoteNumber = await nextQuoteNumber();

  type LineCreate = {
    productId: string | null;
    description: string;
    qty: number;
    unit: string;
    unitPrice: number;
    taxRate: number;
    lineTotal: number;
    sortOrder: number;
  };

  let lines: LineCreate[] = [];

  if (productIds.length > 0) {
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, active: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    lines = productIds
      .map((pid, i) => {
        const p = byId.get(pid);
        if (!p) return null;
        const qty = quantities[pid] ?? defaultQty;
        const unitPrice = decimalToNumber(p.offerPrice);
        const taxRate = decimalToNumber(p.taxRate);
        return {
          productId: p.id,
          description: `${p.name}${p.description ? ` — ${p.description}` : ""}`,
          qty,
          unit: p.unit,
          unitPrice,
          taxRate,
          lineTotal: Math.round(qty * unitPrice * 100) / 100,
          sortOrder: i,
        };
      })
      .filter(Boolean) as LineCreate[];
  }

  if (lines.length === 0) {
    const descParts = [
      rfq.parsedCategory || "RFQ line",
      typeof specs?.description === "string" ? specs.description : null,
      typeof specs?.brand === "string" ? `Brand: ${specs.brand}` : null,
      meta.summary || null,
    ].filter(Boolean);
    lines = [
      {
        productId: null,
        description: descParts.join(" — ") || rfq.subject || "From RFQ",
        qty: defaultQty,
        unit: typeof specs?.unit === "string" ? specs.unit : "pcs",
        unitPrice: 0,
        taxRate: 18,
        lineTotal: 0,
        sortOrder: 0,
      },
    ];
  }

  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const gstAmount = Math.round(lines.reduce((s, l) => s + (l.lineTotal * l.taxRate) / 100, 0) * 100) / 100;
  const grandTotal = Math.round((subtotal + gstAmount) * 100) / 100;

  const quote = await prisma.$transaction(async (tx) => {
    const created = await tx.quote.create({
      data: {
        quoteNumber,
        status: "DRAFT",
        rfqId: rfq.id,
        buyerName: rfq.customerName,
        buyerCompany: rfq.customerCompany,
        buyerEmail: rfq.customerEmail,
        buyerPhone: rfq.customerPhone,
        withGst: true,
        subtotal,
        gstAmount,
        cgstAmount: Math.round((gstAmount / 2) * 100) / 100,
        sgstAmount: Math.round((gstAmount / 2) * 100) / 100,
        grandTotal,
        notes: [
          rfq.subject ? `RFQ subject: ${rfq.subject}` : null,
          `Source: ${rfq.channel}`,
          rfq.parsedCategory ? `Parsed category: ${rfq.parsedCategory}` : null,
          rfq.rawText ? `---\n${rfq.rawText.slice(0, 2000)}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        lineItems: { create: lines },
      },
    });

    await tx.rfq.update({
      where: { id: rfq.id },
      data: { status: "QUOTED" },
    });

    return created;
  });

  return NextResponse.json({ id: quote.id, quoteNumber: quote.quoteNumber }, { status: 201 });
}
