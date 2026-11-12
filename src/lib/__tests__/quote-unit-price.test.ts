import { describe, expect, it } from "vitest";
import {
  clampQuoteUnitPrice,
  isQuoteUnitPriceInRange,
  MAX_QUOTE_UNIT_PRICE,
} from "@/lib/accounting/money";

describe("quote unit price limits", () => {
  it("rejects values that would overflow Decimal(12,2)", () => {
    expect(isQuoteUnitPriceInRange(99_999_999_999_999)).toBe(false);
    expect(clampQuoteUnitPrice(99_999_999_999_999)).toBe(MAX_QUOTE_UNIT_PRICE);
  });

  it("accepts normal sell prices", () => {
    expect(isQuoteUnitPriceInRange(12_000)).toBe(true);
    expect(clampQuoteUnitPrice(12_000)).toBe(12_000);
  });

  it("treats negatives as out of range (sanitize fallback is 0; UI must not commit them)", () => {
    expect(isQuoteUnitPriceInRange(-50)).toBe(false);
    expect(clampQuoteUnitPrice(-50)).toBe(0);
    expect(clampQuoteUnitPrice(-50, 4500)).toBe(4500);
  });
});
