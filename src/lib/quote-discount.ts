import { round2 } from "@/lib/accounting/money";

export type QuoteDiscountMethod = "header" | "lines";

export type PricedLine = {
  qty: number;
  unitPrice: number;
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

export function lineSubtotal(lines: PricedLine[]): number {
  return round2(
    lines.reduce(
      (sum, line) => sum + round2(Number(line.qty) * Number(line.unitPrice)),
      0
    )
  );
}

export function headerDiscountAmount(subtotal: number, percent: number): number {
  const p = clampPercent(percent);
  return round2(Math.max(0, Number(subtotal) || 0) * (p / 100));
}

/**
 * Lower each unit price so the subtotal falls by `percent`.
 * Leftover paise from rounding is absorbed on the last priced line.
 */
export function applyPercentToLinePrices<T extends PricedLine>(
  lines: T[],
  percent: number
): T[] {
  const p = clampPercent(percent);
  const grosses = lines.map((line) =>
    round2(Number(line.qty) * Number(line.unitPrice))
  );
  const originalSubtotal = round2(grosses.reduce((sum, gross) => sum + gross, 0));
  const targetSubtotal = round2(originalSubtotal * (1 - p / 100));

  if (p === 0 || originalSubtotal <= 0) {
    return lines.map((line) => ({
      ...line,
      unitPrice: round2(Math.max(0, Number(line.unitPrice) || 0)),
    }));
  }

  const next = lines.map((line) => ({ ...line }));
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

function clampPercent(percent: number): number {
  const p = Number(percent);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.min(100, p);
}
