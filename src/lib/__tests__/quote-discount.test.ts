import { describe, expect, it } from "vitest";
import {
  applyPercentToLineDiscounts,
  applyPercentToLinePrices,
  effectiveUnitPrice,
  headerDiscountAmount,
  inferDiscountMethods,
  lineSubtotal,
  previewDiscountedSubtotal,
  resolveDiscountApplication,
  shouldChooseQuoteDiscountMethod,
  uniformLineDiscountPercent,
  validateDiscountApplication,
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

  it("computes whole-quote discount from list subtotal when exclusive", () => {
    const lines = [
      { qty: 1, unitPrice: 600 },
      { qty: 1, unitPrice: 400 },
    ];
    expect(lineSubtotal(lines)).toBe(1000);
    expect(headerDiscountAmount(1000, 5)).toBe(50);
    expect(previewDiscountedSubtotal(lines, 5, { method: "header" })).toBe(950);
    expect(previewDiscountedSubtotal(lines, 10, { method: "lines" })).toBe(900);
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

describe("resolveDiscountApplication", () => {
  it("clears header and lines when percent is 0", () => {
    expect(resolveDiscountApplication(0, { method: "header" })).toEqual({
      headerPercent: 0,
      linePercent: 0,
    });
    expect(resolveDiscountApplication(0, { method: "lines" })).toEqual({
      headerPercent: 0,
      linePercent: 0,
    });
  });

  it("applies only the selected exclusive method", () => {
    expect(resolveDiscountApplication(10, { method: "header" })).toEqual({
      headerPercent: 10,
      linePercent: 0,
    });
    expect(resolveDiscountApplication(12, { method: "lines" })).toEqual({
      headerPercent: 0,
      linePercent: 12,
    });
  });
});

describe("inferDiscountMethods", () => {
  it("prefers lines when only line discounts exist", () => {
    expect(
      inferDiscountMethods({ headerPercent: 0, hasLineDiscount: true })
    ).toEqual({ method: "lines" });
  });

  it("defaults to header when both or neither are set", () => {
    expect(
      inferDiscountMethods({ headerPercent: 8, hasLineDiscount: true })
    ).toEqual({ method: "header" });
    expect(
      inferDiscountMethods({ headerPercent: 0, hasLineDiscount: false })
    ).toEqual({ method: "header" });
  });
});

describe("validateDiscountApplication", () => {
  it("rejects percents above 100", () => {
    const result = validateDiscountApplication({
      percent: 120,
      methods: { method: "header" },
      lines: [{ qty: 1, unitPrice: 100 }],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/100/);
  });

  it("allows a normal exclusive discount", () => {
    expect(
      validateDiscountApplication({
        percent: 15,
        methods: { method: "lines" },
        lines: [{ qty: 2, unitPrice: 50 }],
      }).ok
    ).toBe(true);
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
