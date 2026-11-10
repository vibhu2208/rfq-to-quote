import { describe, expect, it } from "vitest";
import {
  applyMarkupPercentToLines,
  costSubtotal,
  headerMarkupAmount,
  markedUpUnitPrice,
  markupBasePrice,
} from "@/lib/quote-markup";
import { lineSubtotal } from "@/lib/quote-discount";

describe("markupBasePrice", () => {
  it("prefers vendor cost when present", () => {
    expect(markupBasePrice({ qty: 1, unitPrice: 120, costPrice: 100 })).toBe(100);
    expect(markupBasePrice({ qty: 1, unitPrice: 120, costPrice: null })).toBe(120);
  });
});

describe("applyMarkupPercentToLines", () => {
  it("marks up each sell price from cost so the subtotal matches", () => {
    const lines = [
      { id: "a", qty: 1, unitPrice: 100, costPrice: 100 },
      { id: "b", qty: 1, unitPrice: 200, costPrice: 200 },
    ];
    const next = applyMarkupPercentToLines(lines, 10);
    expect(costSubtotal(lines)).toBe(300);
    expect(headerMarkupAmount(300, 10)).toBe(30);
    expect(lineSubtotal(next)).toBe(330);
    expect(next[0].unitPrice).toBe(110);
    expect(next[1].unitPrice).toBe(220);
    expect(next[0].costPrice).toBe(100);
  });

  it("falls back to current unit price when cost is missing", () => {
    const lines = [{ key: "x", qty: 2, unitPrice: 50, costPrice: null }];
    const next = applyMarkupPercentToLines(lines, 20);
    expect(next[0].unitPrice).toBe(60);
    expect(lineSubtotal(next)).toBe(120);
  });

  it("0% restores sell prices to the cost base", () => {
    const lines = [{ qty: 1, unitPrice: 150, costPrice: 100 }];
    const next = applyMarkupPercentToLines(lines, 0);
    expect(next[0].unitPrice).toBe(100);
  });
});

describe("markedUpUnitPrice", () => {
  it("applies percent over the base", () => {
    expect(markedUpUnitPrice(1000, 12.5)).toBe(1125);
  });
});
