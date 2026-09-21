import { describe, expect, it } from "vitest";
import {
  parseIndianWordAmount,
  parseVendorLinePrices,
} from "@/lib/parse-vendor-price";

describe("parseIndianWordAmount", () => {
  it("parses compound lakh + thousand", () => {
    expect(parseIndianWordAmount("4 lakh 28 thousand")).toBe(428_000);
    expect(parseIndianWordAmount("4lakh 28 thousand")).toBe(428_000);
    expect(parseIndianWordAmount("the price will be 4lakh 28 thousand")).toBe(
      428_000
    );
  });

  it("parses decimal lakh", () => {
    expect(parseIndianWordAmount("4.28 lakh")).toBe(428_000);
  });

  it("parses lac spelling", () => {
    expect(parseIndianWordAmount("4 lac 28 thousand")).toBe(428_000);
  });
});

describe("parseVendorLinePrices Indian amounts", () => {
  it("extracts counter-offer for a selective RFQ line (lineNumber 4)", () => {
    const text = `the price will be 4lakh 28 thousand

On Mon, Sep 21, 2026 at 8:35 PM Your Company Name wrote:
> Hello Display Hub,`;

    // strip is done by caller; simulate stripped body
    const clean = "the price will be 4lakh 28 thousand";
    const items = [
      {
        lineNumber: 4,
        description: "professional monitors",
        quantity: 12,
        unit: "units",
        category: "Monitors & Displays",
      },
    ];

    const parsed = parseVendorLinePrices(clean, items);
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0].lineNumber).toBe(4);
    expect(parsed.lines[0].lineTotal).toBe(428_000);
    expect(parsed.lines[0].unitPrice).toBeCloseTo(428_000 / 12, 2);
    expect(parsed.total).toBe(428_000);
  });

  it("keeps unit price when vendor says per unit", () => {
    const items = [
      {
        lineNumber: 1,
        description: "UPS",
        quantity: 2,
        unit: "pcs",
      },
    ];
    const parsed = parseVendorLinePrices(
      "rate is 25000 per unit",
      items
    );
    expect(parsed.lines[0].unitPrice).toBe(25_000);
    expect(parsed.lines[0].lineTotal).toBe(50_000);
  });
});
