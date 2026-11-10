import { round2 } from "@/lib/accounting/money";

export type QuoteDiscountMethod = "header" | "lines";

export type QuoteDiscountMethods = {
  header: boolean;
  lines: boolean;
};

export type PricedLine = {
  qty: number;
  unitPrice: number;
  discountPercent?: number;
};

export function shouldChooseQuoteDiscountMethod(input: {
  quoteStatus?: string | null;
  lastReplyIntent?: string | null;
}): boolean {
  return (
    input.quoteStatus === "UNDER_NEGOTIATION" ||
    input.lastReplyIntent === "COUNTER_OFFER"
  );
}

export function clampDiscountPercent(percent: number): number {
  const p = Number(percent);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.min(100, p);
}

/** Sell price after a per-product discount %. */
export function effectiveUnitPrice(
  unitPrice: number,
  discountPercent?: number | null
): number {
  const p = clampDiscountPercent(discountPercent ?? 0);
  return round2(Math.max(0, Number(unitPrice) || 0) * (1 - p / 100));
}

export function lineSubtotal(lines: PricedLine[]): number {
  return round2(
    lines.reduce((sum, line) => {
      const unit = effectiveUnitPrice(line.unitPrice, line.discountPercent);
      return sum + round2(Number(line.qty) * unit);
    }, 0)
  );
}

export function headerDiscountAmount(subtotal: number, percent: number): number {
  const p = clampDiscountPercent(percent);
  return round2(Math.max(0, Number(subtotal) || 0) * (p / 100));
}

/**
 * Set the same per-product discount % on every line (unit prices stay list/sell).
 */
export function applyPercentToLineDiscounts<T extends PricedLine>(
  lines: T[],
  percent: number
): T[] {
  const p = clampDiscountPercent(percent);
  return lines.map((line) => ({
    ...line,
    discountPercent: p,
  }));
}

/**
 * Lower each unit price so the subtotal falls by `percent`.
 * Leftover paise from rounding is absorbed on the last priced line.
 * Kept for negotiation flows that bake the cut into unit prices.
 */
export function applyPercentToLinePrices<T extends PricedLine>(
  lines: T[],
  percent: number
): T[] {
  const p = clampDiscountPercent(percent);
  const grosses = lines.map((line) =>
    round2(
      Number(line.qty) *
        effectiveUnitPrice(line.unitPrice, line.discountPercent)
    )
  );
  const originalSubtotal = round2(grosses.reduce((sum, gross) => sum + gross, 0));
  const targetSubtotal = round2(originalSubtotal * (1 - p / 100));

  if (p === 0 || originalSubtotal <= 0) {
    return lines.map((line) => ({
      ...line,
      unitPrice: round2(Math.max(0, Number(line.unitPrice) || 0)),
      discountPercent: 0,
    }));
  }

  const next = lines.map((line) => ({ ...line, discountPercent: 0 }));
  const adjustable = next
    .map((_, index) => index)
    .filter((index) => Number(next[index].qty) > 0);

  if (adjustable.length === 0) return next;

  let allocated = 0;
  for (let k = 0; k < adjustable.length; k++) {
    const index = adjustable[k];
    const qty = Number(next[index].qty);
    const isLast = k === adjustable.length - 1;
    const lineTotal = isLast
      ? round2(Math.max(0, targetSubtotal - allocated))
      : round2(targetSubtotal * (grosses[index] / originalSubtotal));
    if (!isLast) allocated = round2(allocated + lineTotal);
    next[index] = {
      ...next[index],
      unitPrice: round2(Math.max(0, lineTotal / qty)),
      discountPercent: 0,
    };
  }

  const newSubtotal = lineSubtotal(next);
  const leftover = round2(targetSubtotal - newSubtotal);
  if (leftover === 0) return next;

  const index = adjustable[adjustable.length - 1];
  const qty = Number(next[index].qty);
  const candidate = round2(Math.max(0, Number(next[index].unitPrice) + leftover / qty));
  const trial = next.map((line, i) =>
    i === index ? { ...line, unitPrice: candidate } : line
  );
  const trialSubtotal = lineSubtotal(trial);
  return Math.abs(trialSubtotal - targetSubtotal) <= Math.abs(newSubtotal - targetSubtotal)
    ? trial
    : next;
}

/** Shared per-product % when every line matches; otherwise null. */
export function uniformLineDiscountPercent(
  lines: Array<{ discountPercent?: number | null }>
): number | null {
  if (lines.length === 0) return null;
  const first = clampDiscountPercent(lines[0].discountPercent ?? 0);
  for (const line of lines) {
    if (clampDiscountPercent(line.discountPercent ?? 0) !== first) return null;
  }
  return first > 0 ? first : null;
}
