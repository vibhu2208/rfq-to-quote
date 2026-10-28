import { describe, expect, it } from "vitest";
import { catalogSellPrice, resolveQuoteUnitPrice } from "@/lib/product-price";

describe("catalogSellPrice", () => {
  it("prefers last price, then offer, MRP, then cost", () => {
    expect(
      catalogSellPrice({ lastPrice: 10, offerPrice: 20, mrp: 30, basePrice: 40 })
    ).toBe(10);
    expect(catalogSellPrice({ lastPrice: 0, offerPrice: 20, mrp: 30, basePrice: 40 })).toBe(20);
    expect(catalogSellPrice({ lastPrice: null, offerPrice: 0, mrp: 30, basePrice: 40 })).toBe(30);
    expect(catalogSellPrice({ offerPrice: 0, mrp: null, basePrice: 40 })).toBe(40);
  });
});

describe("resolveQuoteUnitPrice", () => {
  const product = { lastPrice: 7200, offerPrice: 0, mrp: 8000, basePrice: 5000 };

  it("uses a positive vendor/quoted override", () => {
    expect(resolveQuoteUnitPrice(6500, product)).toBe(6500);
  });

  it("ignores a 0 override and falls back to catalog last price", () => {
    expect(resolveQuoteUnitPrice(0, product)).toBe(7200);
    expect(resolveQuoteUnitPrice(undefined, product)).toBe(7200);
  });
});
