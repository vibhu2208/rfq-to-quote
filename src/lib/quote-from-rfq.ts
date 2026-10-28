import { prisma } from "@/lib/prisma";
import { nextQuoteNumber, decimalToNumber } from "@/lib/quotes";
import { catalogSellPrice } from "@/lib/product-price";
import { extractRfqItems } from "@/lib/rfq-items";
import {
  matchProductsToRfq,
  matchProductsToRfqItems,
} from "@/lib/product-match";

export type QuoteFromRfqLine = {
  productId: string;
  qty: number;
  unitPrice?: number;
};

export type CreateQuoteFromRfqInput = {
  rfqId: string;
  productIds?: string[];
  quantities?: Record<string, number>;
  lines?: QuoteFromRfqLine[];
  buyerGstin?: string;
  buyerAddress?: string;
  buyerState?: string;
};

export async function createQuoteFromRfq(input: CreateQuoteFromRfqInput) {
  const rfq = await prisma.rfq.findUnique({ where: { id: input.rfqId } });
  if (!rfq) throw new Error("RFQ not found");

  const productIds = input.productIds || [];
  const quantities = input.quantities || {};
  const explicitLines = input.lines || [];

  const specs = rfq.parsedSpecs as Record<string, unknown> | null;
  const meta = (specs?._meta as { summary?: string } | undefined) || {};
  const requirementItems = extractRfqItems(specs, rfq.rawText);
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

  const buildLine = (
    p: {
      id: string;
      name: string;
      description: string;
      unit: string;
      offerPrice: unknown;
      lastPrice?: unknown;
      taxRate: unknown;
    },
    qty: number,
    sortOrder: number,
    unitPriceOverride?: number
  ): LineCreate => {
    const unitPrice =
      unitPriceOverride != null && Number.isFinite(unitPriceOverride)
        ? unitPriceOverride
        : catalogSellPrice(p);
    const taxRate = decimalToNumber(p.taxRate);
    return {
      productId: p.id,
      description: `${p.name}${p.description ? ` — ${p.description}` : ""}`,
      qty,
      unit: p.unit,
      unitPrice,
      taxRate,
      lineTotal: Math.round(qty * unitPrice * 100) / 100,
      sortOrder,
    };
  };

  const lineRequests: QuoteFromRfqLine[] =
    explicitLines.length > 0
      ? explicitLines
      : productIds.map((pid) => ({
          productId: pid,
          qty: quantities[pid] ?? defaultQty,
        }));

  if (lineRequests.length > 0) {
    const ids = lineRequests.map((l) => l.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: ids }, active: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    lines = lineRequests
      .map((req, i) => {
        const p = byId.get(req.productId);
        if (!p) return null;
        return buildLine(p, req.qty, i, req.unitPrice);
      })
      .filter(Boolean) as LineCreate[];
  }

  if (lines.length === 0 && requirementItems.length > 1) {
    lines = requirementItems.map((item, i) => ({
      productId: null,
      description: item.description,
      qty: item.quantity,
      unit: item.unit,
      unitPrice: 0,
      taxRate: 18,
      lineTotal: 0,
      sortOrder: i,
    }));
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
  const gstAmount =
    Math.round(lines.reduce((s, l) => s + (l.lineTotal * l.taxRate) / 100, 0) * 100) / 100;
  const grandTotal = Math.round((subtotal + gstAmount) * 100) / 100;

  return prisma.$transaction(async (tx) => {
    const created = await tx.quote.create({
      data: {
        quoteNumber,
        status: "DRAFT",
        rfqId: rfq.id,
        buyerName: rfq.customerName,
        buyerCompany: rfq.customerCompany,
        buyerEmail: rfq.customerEmail,
        buyerPhone: rfq.customerPhone,
        buyerGstin: input.buyerGstin || "",
        buyerAddress: input.buyerAddress || "",
        buyerState: input.buyerState || "",
        withGst: true,
        subtotal,
        gstAmount,
        cgstAmount: Math.round((gstAmount / 2) * 100) / 100,
        sgstAmount: Math.round((gstAmount / 2) * 100) / 100,
        grandTotal,
        notes: "",
        lineItems: { create: lines },
      },
    });

    await tx.rfq.update({
      where: { id: rfq.id },
      data: { status: "QUOTED" },
    });

    return created;
  });
}

export async function autoMatchQuoteLines(rfqId: string): Promise<QuoteFromRfqLine[]> {
  const rfq = await prisma.rfq.findUnique({ where: { id: rfqId } });
  if (!rfq) return [];

  const products = await prisma.product.findMany({ where: { active: true } });
  const input = {
    parsedCategory: rfq.parsedCategory,
    parsedSpecs: rfq.parsedSpecs,
    subject: rfq.subject,
    rawText: rfq.rawText,
  };

  const itemMatches = matchProductsToRfqItems(products, input);
  const lines: QuoteFromRfqLine[] = [];
  const used = new Set<string>();

  for (const item of itemMatches) {
    const top = item.matches[0];
    if (!top || top.score < 10 || used.has(top.product.id)) continue;
    used.add(top.product.id);
    lines.push({
      productId: top.product.id,
      qty: item.requirement.quantity > 0 ? item.requirement.quantity : 1,
    });
  }

  if (lines.length === 0) {
    const overall = matchProductsToRfq(products, input, 5);
    const specs = rfq.parsedSpecs as Record<string, unknown> | null;
    const defaultQty =
      typeof specs?.quantity === "number" && specs.quantity > 0 ? specs.quantity : 1;
    if (overall[0]) {
      lines.push({ productId: overall[0].product.id, qty: defaultQty });
    }
  }

  return lines;
}
