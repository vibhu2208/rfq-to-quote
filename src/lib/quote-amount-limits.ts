import { MAX_QUOTE_MONEY, MAX_QUOTE_UNIT_PRICE, round2 } from "@/lib/accounting/money";
import { effectiveUnitPrice } from "@/lib/quote-discount";

/** Max quantity per line before line total overflows quote money columns. */
export const MAX_QUOTE_LINE_QTY = 99_999_999;

export type AmountLine = {
  name?: string;
  qty: number;
  unitPrice: number;
  discountPercent?: number;
};

function moneyLabel(max: number): string {
  return max.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Explain which amount cannot be saved. Returns null when every amount fits
 * the quote money columns.
 */
export function quoteAmountBlockReason(input: {
  lines: AmountLine[];
  grandTotal: number;
}): string | null {
  const unitMax = moneyLabel(MAX_QUOTE_UNIT_PRICE);
  const totalMax = moneyLabel(MAX_QUOTE_MONEY);

  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    const label = line.name?.trim() || `Line ${i + 1}`;
    const qty = Math.max(0, Number(line.qty) || 0);
    if (qty > MAX_QUOTE_LINE_QTY) {
      return `${label} quantity exceeds the maximum of ${MAX_QUOTE_LINE_QTY.toLocaleString("en-IN")}. Lower the quantity.`;
    }
    if (Number.isFinite(line.unitPrice) && line.unitPrice > MAX_QUOTE_UNIT_PRICE) {
      return `${label} sell price is above the maximum of ${unitMax}. The previous price was kept.`;
    }
    const net = effectiveUnitPrice(line.unitPrice, line.discountPercent);
    const lineTotal = round2(qty * net);
    if (lineTotal > MAX_QUOTE_MONEY) {
      return `${label} line total ${lineTotal.toLocaleString("en-IN")} exceeds the maximum of ${totalMax}. Lower the quantity or sell price.`;
    }
  }

  if (Number.isFinite(input.grandTotal) && input.grandTotal > MAX_QUOTE_MONEY) {
    return `Grand total exceeds the maximum of ${totalMax}. Lower a line amount before saving.`;
  }
  return null;
}
