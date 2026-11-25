import {
  clampQuoteUnitPrice,
  MAX_QUOTE_MONEY,
  MAX_QUOTE_UNIT_PRICE,
  round2,
} from "@/lib/accounting/money";
import {
  MAX_QUOTE_LINE_QTY,
  quoteAmountBlockReason,
} from "@/lib/quote-amount-limits";
import { effectiveUnitPrice } from "@/lib/quote-discount";

export class QuoteLineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteLineValidationError";
  }
}

export type QuoteLineSanitizeInput = {
  productId: string | null;
  description: string;
  aliasName: string;
  qty: number;
  unit: string;
  unitPrice: number;
  costPrice?: number | null;
  costVendorName?: string;
  taxRate: number;
  lineTotal: number;
  sortOrder: number;
  discountPercent?: number;
};

function clampQty(qty: number): number {
  const n = Number(qty);
  if (!Number.isFinite(n) || n < 0) return 1;
  return Math.min(MAX_QUOTE_LINE_QTY, n);
}

function clampTaxRate(rate: number): number {
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0) return 18;
  return Math.min(100, n);
}

/**
 * Clamp money fields and recompute line total before QuoteLineItem.createMany.
 * Throws QuoteLineValidationError when amounts cannot fit DB columns.
 */
export function sanitizeQuoteLinesForCreate(
  lines: QuoteLineSanitizeInput[]
): QuoteLineSanitizeInput[] {
  const sanitized = lines.map((line, index) => {
    const qty = clampQty(line.qty);
    const rawUnit = Math.max(0, Number(line.unitPrice) || 0);
    if (rawUnit > MAX_QUOTE_UNIT_PRICE) {
      throw new QuoteLineValidationError(
        `Sell price is above the maximum allowed. Lower the price before saving.`
      );
    }
    const unitPrice = clampQuoteUnitPrice(rawUnit);
    const discountPercent = line.discountPercent ?? 0;
    const net = effectiveUnitPrice(unitPrice, discountPercent);
    const lineTotal = round2(qty * net);
    const costPrice =
      line.costPrice != null && line.costPrice > 0
        ? clampQuoteUnitPrice(line.costPrice)
        : null;
  return {
      ...line,
      qty,
      unitPrice,
      costPrice,
      taxRate: clampTaxRate(line.taxRate),
      lineTotal,
      sortOrder: line.sortOrder ?? index,
    };
  });

  const block = quoteAmountBlockReason({
    lines: sanitized.map((l) => ({
      name: l.aliasName || l.description || `Line ${l.sortOrder + 1}`,
      qty: l.qty,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
    })),
    grandTotal: sanitized.reduce((s, l) => s + l.lineTotal, 0),
  });
  if (block) throw new QuoteLineValidationError(block);

  for (const line of sanitized) {
    if (line.lineTotal > MAX_QUOTE_MONEY) {
      throw new QuoteLineValidationError(
        `Line total exceeds the maximum allowed (${MAX_QUOTE_MONEY}). Lower quantity or sell price.`
      );
    }
  }

  return sanitized;
}