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
  offerPrice: unknown;
}): number {
  const last = decimalToNumber(product.lastPrice);
  if (last > 0) return last;
  return decimalToNumber(product.offerPrice);
}
