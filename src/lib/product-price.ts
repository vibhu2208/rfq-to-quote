import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/quotes";

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
