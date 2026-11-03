import { describe, expect, it } from "vitest";
import {
  cheapestVendorQuote,
  selectedVendorQuote,
  vendorQuotesForQuoteLine,
  vendorQuotesFromMatches,
  type RfqLineVendorQuotes,
} from "@/lib/quote-line-vendor-cost";
import type { VendorPriceMatch } from "@/lib/vendor-line-price";

const groups: RfqLineVendorQuotes[] = [
  {
    lineNumber: 1,
    description: "Laptop",
    options: [
      { vendorId: "v1", vendorName: "NetWire", unitPrice: 418500, source: "Last quoted" },
      { vendorId: "v2", vendorName: "Recore", unitPrice: 400000, source: "Vendor reply" },
    ],
  },
  {
    lineNumber: 3,
    description: "Monitor",
    options: [
      { vendorId: "v1", vendorName: "NetWire", unitPrice: 12500, source: "Last quoted" },
    ],
  },
];

describe("vendorQuotesForQuoteLine", () => {
  it("maps by index when every quote line has vendor prices", () => {
    const even: RfqLineVendorQuotes[] = [
      groups[0],
      { ...groups[1], lineNumber: 2 },
    ];
    expect(
      vendorQuotesForQuoteLine({ aliasName: "Laptop", sortOrder: 0 }, 0, even, 2)
    ).toEqual(even[0].options);
    expect(
      vendorQuotesForQuoteLine({ aliasName: "Monitor", sortOrder: 1 }, 1, even, 2)
    ).toEqual(even[1].options);
  });

  it("matches skipped RFQ lines by alias description", () => {
    const options = vendorQuotesForQuoteLine(
      { aliasName: "Monitor", sortOrder: 1 },
      1,
      groups,
      2
    );
    expect(options).toEqual(groups[1].options);
  });
});

describe("cheapestVendorQuote", () => {
  it("picks the lowest unit cost", () => {
    expect(cheapestVendorQuote(groups[0].options)?.vendorName).toBe("Recore");
  });
});

describe("selectedVendorQuote", () => {
  it("keeps the chosen vendor when several quoted the same product", () => {
    expect(
      selectedVendorQuote(groups[0].options, 418500, "NetWire")?.vendorName
    ).toBe("NetWire");
  });

  it("falls back to the cheapest quote when none is chosen", () => {
    expect(selectedVendorQuote(groups[0].options)?.vendorName).toBe("Recore");
  });
});

describe("vendorQuotesFromMatches", () => {
  it("groups every vendor price onto the RFQ line", () => {
    const matches: VendorPriceMatch[] = [
      {
        vendor: { id: "v1", name: "NetWire" },
        matchedLines: [{ lineNumber: 1, unitPrice: 418500, description: "Laptop" }],
      },
      {
        vendor: { id: "v2", name: "Recore" },
        outreach: {
          status: "REPLIED",
          quotedLineItems: [{ lineNumber: 1, unitPrice: 400000, description: "Laptop" }],
        },
      },
    ];
    const grouped = vendorQuotesFromMatches(matches);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].lineNumber).toBe(1);
    expect(grouped[0].options.map((opt) => opt.vendorName)).toEqual([
      "Recore",
      "NetWire",
    ]);
    expect(grouped[0].options[0].unitPrice).toBe(400000);
  });
});
