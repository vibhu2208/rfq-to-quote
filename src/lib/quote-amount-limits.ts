import { MAX_QUOTE_MONEY, MAX_QUOTE_UNIT_PRICE, round2 } from "@/lib/accounting/money";
import { effectiveUnitPrice } from "@/lib/quote-discount";

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
    if (Number.isFinite(line.unitPrice) && line.unitPrice > MAX_QUOTE_UNIT_PRICE) {
      return `${label} sell price is above the maximum of ${unitMax}. The previous price was kept.`;
    }
    const net = effectiveUnitPrice(line.unitPrice, line.discountPercent);
    const lineTotal = round2(Math.max(0, Number(line.qty) || 0) * net);
    if (lineTotal > MAX_QUOTE_MONEY) {
      return `${label} total ${lineTotal.toLocaleString("en-IN")} exceeds the maximum of ${totalMax}. Lower the quantity or sell price.`;
    }
  }

  if (Number.isFinite(input.grandTotal) && input.grandTotal > MAX_QUOTE_MONEY) {
    return `Grand total exceeds the maximum of ${totalMax}. Lower a line amount before saving.`;
  }
  return null;
}
