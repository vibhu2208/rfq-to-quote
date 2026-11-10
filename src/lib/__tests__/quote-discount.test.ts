import { describe, expect, it } from "vitest";
import {
  applyPercentToLineDiscounts,
  applyPercentToLinePrices,
  effectiveUnitPrice,
  headerDiscountAmount,
  lineSubtotal,
  shouldChooseQuoteDiscountMethod,
  uniformLineDiscountPercent,
} from "@/lib/quote-discount";

describe("shouldChooseQuoteDiscountMethod", () => {
  it("asks while the quote is under negotiation or the buyer countered", () => {
    expect(shouldChooseQuoteDiscountMethod({ quoteStatus: "UNDER_NEGOTIATION" })).toBe(
      true
    );
    expect(shouldChooseQuoteDiscountMethod({ lastReplyIntent: "COUNTER_OFFER" })).toBe(
      true
    );
    expect(shouldChooseQuoteDiscountMethod({ quoteStatus: "DRAFT" })).toBe(false);
  });
});

describe("effectiveUnitPrice + line discounts", () => {
  it("applies per-product discount without changing list unit price", () => {
    expect(effectiveUnitPrice(1000, 10)).toBe(900);
    const lines = applyPercentToLineDiscounts(
      [
        { id: "a", qty: 1, unitPrice: 600 },
        { id: "b", qty: 1, unitPrice: 400 },
      ],
      10
    );
    expect(lines[0].unitPrice).toBe(600);
    expect(lines[0].discountPercent).toBe(10);
    expect(lineSubtotal(lines)).toBe(900);
  });

  it("stacks with a whole-quote header discount on the reduced subtotal", () => {
    const lines = applyPercentToLineDiscounts(
      [
        { qty: 1, unitPrice: 600 },
        { qty: 1, unitPrice: 400 },
      ],
      10
    );
    const afterLines = lineSubtotal(lines);
    expect(afterLines).toBe(900);
    expect(headerDiscountAmount(afterLines, 5)).toBe(45);
  });

  it("reports a uniform line discount percent", () => {
    expect(
      uniformLineDiscountPercent([
        { discountPercent: 8 },
        { discountPercent: 8 },
      ])
    ).toBe(8);
    expect(
      uniformLineDiscountPercent([
        { discountPercent: 8 },
        { discountPercent: 5 },
      ])
    ).toBeNull();
  });
});

describe("applyPercentToLinePrices", () => {
  it("reduces each unit price so the subtotal matches the discount percent", () => {
    const lines = [
      { id: "a", qty: 1, unitPrice: 600 },
      { id: "b", qty: 1, unitPrice: 400 },
    ];
    const next = applyPercentToLinePrices(lines, 10);
    expect(lineSubtotal(next)).toBe(900);
    expect(headerDiscountAmount(1000, 10)).toBe(100);
    expect(next[0].unitPrice).toBe(540);
    expect(next[1].unitPrice).toBe(360);
  });

  it("keeps line identity and matches the header-discount subtotal", () => {
    const lines = [
      { key: "x", qty: 3, unitPrice: 10.33 },
      { key: "y", qty: 1, unitPrice: 20 },
    ];
    const original = lineSubtotal(lines);
    const next = applyPercentToLinePrices(lines, 7);
    expect(next[0].key).toBe("x");
    expect(next[1].key).toBe("y");
    expect(lineSubtotal(next)).toBe(original - headerDiscountAmount(original, 7));
  });
});
