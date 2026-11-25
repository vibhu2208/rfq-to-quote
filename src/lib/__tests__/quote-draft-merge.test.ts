import { describe, expect, it } from "vitest";
import { mergeDraftQuoteLines } from "@/lib/quote-draft-merge";

describe("mergeDraftQuoteLines", () => {
  const existing = [
    {
      id: "line-a",
      productId: "prod-1",
      aliasName: "16-port switch",
      description: "",
      qty: 2,
      unit: "nos",
      unitPrice: 4500,
      discountPercent: 0,
      taxRate: 18,
      sortOrder: 1,
    },
    {
      id: "line-b",
      productId: null,
      aliasName: "Custom HDMI run",
      description: "",
      qty: 1,
      unit: "pcs",
      unitPrice: 1234.56,
      discountPercent: 0,
      taxRate: 18,
      sortOrder: 2,
      customItem: true,
    },
  ];

  it("preserves qty and sell on matched lines and leaves custom lines", () => {
    const first = mergeDraftQuoteLines(existing, [
      {
        rfqLineId: 1,
        productId: "prod-1",
        aliasName: "16-port switch",
        qty: 3,
        unitPrice: 100,
      },
      {
        rfqLineId: 2,
        productId: null,
        aliasName: "Custom HDMI run",
        qty: 5,
        unitPrice: 0,
      },
    ]);
    expect(first.lines).toHaveLength(2);
    expect(first.lines[0].qty).toBe(2);
    expect(first.lines[0].unitPrice).toBe(4500);
    expect(first.lines[1].unitPrice).toBe(1234.56);

    const second = mergeDraftQuoteLines(existing, [
      {
        rfqLineId: 1,
        productId: "prod-1",
        aliasName: "16-port switch",
        qty: 3,
        unitPrice: 100,
      },
      {
        rfqLineId: 2,
        productId: null,
        aliasName: "Custom HDMI run",
        qty: 5,
        unitPrice: 0,
      },
    ]);
    expect(second.lines.map((line) => line.unitPrice)).toEqual(
      first.lines.map((line) => line.unitPrice)
    );
    expect(second.lines.map((line) => line.qty)).toEqual(first.lines.map((line) => line.qty));
  });

  it("adds a new RFQ line once without duplicating", () => {
    const { lines } = mergeDraftQuoteLines(existing, [
      {
        rfqLineId: 1,
        productId: "prod-1",
        aliasName: "16-port switch",
        qty: 1,
      },
      {
        rfqLineId: 2,
        productId: null,
        aliasName: "Custom HDMI run",
        qty: 1,
      },
      {
        rfqLineId: 3,
        productId: "prod-9",
        aliasName: "CAT6 patch cord 1 m",
        qty: 50,
        unitPrice: 120,
      },
      {
        rfqLineId: 3,
        productId: "prod-9",
        aliasName: "CAT6 patch cord 1 m",
        qty: 50,
      },
    ]);
    expect(lines).toHaveLength(3);
    expect(lines.find((line) => line.aliasName.includes("CAT6"))?.qty).toBe(50);
  });
});