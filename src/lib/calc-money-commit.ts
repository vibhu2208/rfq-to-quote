import { round2 } from "@/lib/accounting/money";

export type MoneyCommitOpts = {
  min: number;
  max?: number;
  /** Last committed value; restored when the edit is rejected. */
  prior: number;
};

export type MoneyCommitResult =
  | { ok: true; value: number; clampedToMax?: boolean }
  | { ok: false; reason: "below_min" | "invalid" };

/**
 * Resolve a typed/evaluated money edit.
 * Negative (below min) values are rejected so the caller can keep the prior
 * price — never coerce an invalid sell price into a free ₹0 line.
 */
export function resolveMoneyCommit(
  next: number,
  opts: MoneyCommitOpts
): MoneyCommitResult {
  if (!Number.isFinite(next)) return { ok: false, reason: "invalid" };
  if (next < opts.min) return { ok: false, reason: "below_min" };

  let value = round2(next);
  let clampedToMax = false;
  if (
    typeof opts.max === "number" &&
    Number.isFinite(opts.max) &&
    value > opts.max
  ) {
    value = round2(opts.max);
    clampedToMax = true;
  }
  return { ok: true, value, clampedToMax };
}

export function formatMoneyCommitRangeError(
  reason: "below_min" | "above_max" | "invalid",
  opts: Pick<MoneyCommitOpts, "min" | "max">
): string {
  if (reason === "below_min") {
    if (opts.min === 0) return "Price cannot be negative";
    return `Min value is ${opts.min.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (reason === "above_max" && typeof opts.max === "number") {
    return `Max value is ${opts.max.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return "Invalid price";
}
