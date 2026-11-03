import { describe, expect, it } from "vitest";
import {
  vendorCostTotal,
  vendorPricedLineNumbers,
  vendorUnitCostForLine,
  vendorsWithPriceForLine,
  type VendorPriceMatch,
} from "@/lib/vendor-line-price";

const vendor = (id: string, name: string): VendorPriceMatch["vendor"] => ({
  id,
  name,
});

describe("vendorUnitCostForLine", () => {
  it("prefers a Recore reply over last-quoted history", () => {
    const match: VendorPriceMatch = {
      vendor: vendor("v1", "NetWire"),
      outreach: {
        status: "REPLIED",
        quotedLineItems: [{ lineNumber: 1, unitPrice: 3900, quantity: 2 }],
      },
      matchedLines: [{ lineNumber: 1, unitPrice: 4150, quantity: 2 }],
    };
    const cost = vendorUnitCostForLine(match, 1);
    expect(cost?.unitPrice).toBe(3900);
    expect(cost?.source).toBe("Vendor reply");
  });

  it("uses last quoted cost when the vendor has not replied", () => {
    const match: VendorPriceMatch = {
      vendor: vendor("v1", "NetWire"),
      outreach: null,
      matchedLines: [{ lineNumber: 2, unitPrice: 4150, quantity: 4, description: "PoE switch" }],
    };
    const cost = vendorUnitCostForLine(match, 2);
    expect(cost).toMatchObject({
      unitPrice: 4150,
      source: "Last quoted",
      vendorId: "v1",
    });
  });

  it("skips declined vendors", () => {
    const match: VendorPriceMatch = {
      vendor: vendor("v1", "NetWire"),
      outreach: {
        status: "DECLINED",
        quotedLineItems: [{ lineNumber: 1, unitPrice: 1000 }],
      },
      matchedLines: [{ lineNumber: 1, unitPrice: 4150 }],
    };
    expect(vendorUnitCostForLine(match, 1)).toBeNull();
  });
});

describe("vendorsWithPriceForLine", () => {
  it("lists last-quoted vendors so they can be selected for a quote", () => {
    const matches: VendorPriceMatch[] = [
      {
        vendor: vendor("a", "Alpha"),
        matchedLines: [{ lineNumber: 1, unitPrice: 100 }],
      },
      {
        vendor: vendor("b", "Beta"),
        matchedLines: [{ lineNumber: 1, unitPrice: null }],
      },
    ];
    expect(vendorsWithPriceForLine(matches, 1).map((v) => v.vendorId)).toEqual(["a"]);
  });
});

describe("vendorCostTotal", () => {
  it("sums only this RFQ's priced lines", () => {
    const match: VendorPriceMatch = {
      vendor: vendor("v1", "NetWire"),
      matchedLines: [
        { lineNumber: 1, unitPrice: 100, quantity: 2 },
        { lineNumber: 3, unitPrice: 50, quantity: 1 },
      ],
    };
    expect(vendorPricedLineNumbers(match)).toEqual([1, 3]);
    expect(vendorCostTotal(match)).toBe(250);
  });
});
