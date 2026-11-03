import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/quotes";

export type ProductQuotedPriceHistoryItem = {
  quoteId: string;
  quoteNumber: string;
  clientName: string;
  unitPrice: number;
  quotedAt: string;
  status: string;
};

export async function recordProductLastPrice(productId: string, price: number) {
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Price must be a number 0 or greater");
  }

  const rounded = Math.round(price * 100) / 100;
  const product = await prisma.product.update({
    where: { id: productId },
    data: {
      lastPrice: rounded,
      lastPricedAt: new Date(),
      offerPrice: rounded,
    },
  });

  return {
    id: product.id,
    lastPrice: decimalToNumber(product.lastPrice),
    lastPricedAt: product.lastPricedAt,
    offerPrice: decimalToNumber(product.offerPrice),
  };
}

/** Recent sell prices for a catalog product from past quotes (newest first). */
export async function getProductPriceHistory(
  productId: string,
  limit = 4
): Promise<{
  productId: string;
  code: string;
  name: string;
  lastPrice: number | null;
  lastPricedAt: string | null;
  offerPrice: number;
  history: ProductQuotedPriceHistoryItem[];
}> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      code: true,
      name: true,
      lastPrice: true,
      lastPricedAt: true,
      offerPrice: true,
    },
  });
  if (!product) {
    throw new Error("Product not found");
  }

  const lines = await prisma.quoteLineItem.findMany({
    where: {
      productId,
      unitPrice: { gt: 0 },
    },
    orderBy: [{ quote: { updatedAt: "desc" } }, { sortOrder: "asc" }],
    take: 40,
    select: {
      unitPrice: true,
      quote: {
        select: {
          id: true,
          quoteNumber: true,
          buyerCompany: true,
          buyerName: true,
          status: true,
          updatedAt: true,
          createdAt: true,
        },
      },
    },
  });

  const history: ProductQuotedPriceHistoryItem[] = [];
  const seenQuotes = new Set<string>();
  for (const line of lines) {
    if (seenQuotes.has(line.quote.id)) continue;
    seenQuotes.add(line.quote.id);
    const clientName =
      line.quote.buyerCompany.trim() ||
      line.quote.buyerName.trim() ||
      "Unknown client";
    history.push({
      quoteId: line.quote.id,
      quoteNumber: line.quote.quoteNumber,
      clientName,
      unitPrice: decimalToNumber(line.unitPrice),
      quotedAt: (line.quote.updatedAt || line.quote.createdAt).toISOString(),
      status: line.quote.status,
    });
    if (history.length >= limit) break;
  }

  return {
    productId: product.id,
    code: product.code,
    name: product.name,
    lastPrice: decimalToNumber(product.lastPrice) || null,
    lastPricedAt: product.lastPricedAt?.toISOString() || null,
    offerPrice: decimalToNumber(product.offerPrice),
    history,
  };
}

export function catalogSellPrice(product: {
  lastPrice?: unknown;
  offerPrice?: unknown;
  mrp?: unknown;
  basePrice?: unknown;
}): number {
  const last = decimalToNumber(product.lastPrice);
  if (last > 0) return last;
  const offer = decimalToNumber(product.offerPrice);
  if (offer > 0) return offer;
  const mrp = decimalToNumber(product.mrp);
  if (mrp > 0) return mrp;
  const base = decimalToNumber(product.basePrice);
  return base > 0 ? base : 0;
}

/** Prefer a real quoted/vendor price; otherwise use catalog last → offer → MRP → cost. */
export function resolveQuoteUnitPrice(
  override: number | undefined | null,
  product: {
    lastPrice?: unknown;
    offerPrice?: unknown;
    mrp?: unknown;
    basePrice?: unknown;
  }
): number {
  if (override != null && Number.isFinite(override) && override > 0) return override;
  return catalogSellPrice(product);
}
