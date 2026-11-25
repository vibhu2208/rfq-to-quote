import { describe, expect, it } from "vitest";
import {
  clampQuoteUnitPrice,
  isQuoteUnitPriceInRange,
  MAX_QUOTE_UNIT_PRICE,
  round2,
} from "@/lib/accounting/money";
import { resolveMoneyCommit } from "@/lib/calc-money-commit";

describe("quote unit price limits", () => {
  it("rejects values that would overflow Decimal(12,2)", () => {
    expect(isQuoteUnitPriceInRange(99_999_999_999_999)).toBe(false);
    expect(clampQuoteUnitPrice(99_999_999_999_999)).toBe(MAX_QUOTE_UNIT_PRICE);
  });

  it("accepts normal sell prices", () => {
    expect(isQuoteUnitPriceInRange(12_000)).toBe(true);
    expect(clampQuoteUnitPrice(12_000)).toBe(12_000);
  });

  it("commits typed sell prices with half-up rounding at two decimals", () => {
    const result = resolveMoneyCommit(1234.567, { min: 0, prior: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(1234.57);
    expect(round2(1.5 * 0.9 * 1234.57)).toBe(1666.67);
  });

  it("treats negatives as out of range (sanitize fallback is 0; UI must not commit them)", () => {
    expect(isQuoteUnitPriceInRange(-50)).toBe(false);
    expect(clampQuoteUnitPrice(-50)).toBe(0);
    expect(clampQuoteUnitPrice(-50, 4500)).toBe(4500);
  });
});
