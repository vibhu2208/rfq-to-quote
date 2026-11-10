import { round2 } from "@/lib/accounting/money";

export type MarkupLine = {
  qty: number;
  unitPrice: number;
  costPrice?: number | null;
};

/** Prefer vendor cost; fall back to current sell when cost is missing. */
export function markupBasePrice(line: MarkupLine): number {
  if (line.costPrice != null && Number(line.costPrice) > 0) {
    return Number(line.costPrice);
  }
  return Math.max(0, Number(line.unitPrice) || 0);
}

export function clampMarkupPercent(percent: number): number {
  const p = Number(percent);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.min(1000, p);
}

export function headerMarkupAmount(baseSubtotal: number, percent: number): number {
  const p = clampMarkupPercent(percent);
  return round2(Math.max(0, Number(baseSubtotal) || 0) * (p / 100));
}

export function markedUpUnitPrice(base: number, percent: number): number {
  const p = clampMarkupPercent(percent);
  return round2(Math.max(0, Number(base) || 0) * (1 + p / 100));
}

/**
 * Raise each unit (sell) price by `percent` over vendor cost when present,
 * otherwise over the current unit price. Leftover paise from rounding is
 * absorbed on the last priced line so the subtotal matches the target.
 */
export function applyMarkupPercentToLines<T extends MarkupLine>(
  lines: T[],
  percent: number
): T[] {
  const p = clampMarkupPercent(percent);
  const bases = lines.map((line) => markupBasePrice(line));
  const baseGrosses = lines.map((line, i) =>
    round2(Number(line.qty) * bases[i])
  );
  const baseSubtotal = round2(baseGrosses.reduce((sum, gross) => sum + gross, 0));
  const targetSubtotal = round2(baseSubtotal * (1 + p / 100));

  if (p === 0 || baseSubtotal <= 0) {
    return lines.map((line, i) => ({
      ...line,
      unitPrice: round2(bases[i]),
    }));
  }

  const next = lines.map((line) => ({ ...line }));
  const adjustable = next
    .map((_, index) => index)
    .filter((index) => Number(next[index].qty) > 0 && bases[index] > 0);

  if (adjustable.length === 0) return next;

  let allocated = 0;
  for (let k = 0; k < adjustable.length; k++) {
    const index = adjustable[k];
    const qty = Number(next[index].qty);
    const isLast = k === adjustable.length - 1;
    const lineTotal = isLast
      ? round2(Math.max(0, targetSubtotal - allocated))
      : round2(targetSubtotal * (baseGrosses[index] / baseSubtotal));
    if (!isLast) allocated = round2(allocated + lineTotal);
    next[index] = {
      ...next[index],
      unitPrice: round2(Math.max(0, lineTotal / qty)),
    };
  }

  const newSubtotal = round2(
    next.reduce(
      (sum, line) => sum + round2(Number(line.qty) * Number(line.unitPrice)),
      0
    )
  );
  const leftover = round2(targetSubtotal - newSubtotal);
  if (leftover === 0) return next;

  const index = adjustable[adjustable.length - 1];
  const qty = Number(next[index].qty);
  const candidate = round2(
    Math.max(0, Number(next[index].unitPrice) + leftover / qty)
  );
  const trial = next.map((line, i) =>
    i === index ? { ...line, unitPrice: candidate } : line
  );
  const trialSubtotal = round2(
    trial.reduce(
      (sum, line) => sum + round2(Number(line.qty) * Number(line.unitPrice)),
      0
    )
  );
  return Math.abs(trialSubtotal - targetSubtotal) <=
    Math.abs(newSubtotal - targetSubtotal)
    ? trial
    : next;
}

export function costSubtotal(lines: MarkupLine[]): number {
  return round2(
    lines.reduce((sum, line) => {
      const base = markupBasePrice(line);
      const qty = Number(line.qty);
      if (!(qty > 0) || !(base > 0)) return sum;
      return sum + round2(qty * base);
    }, 0)
  );
}
