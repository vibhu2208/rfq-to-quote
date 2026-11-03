import { describe, expect, it } from "vitest";
import {
  formatQuoteQty,
  formatTaxAnalysis,
  quoteShowHsn,
  quoteShowUnit,
} from "@/lib/quote-format";

describe("quoteShowUnit", () => {
  it("shows units unless the quotation explicitly hides them", () => {
    expect(quoteShowUnit(undefined)).toBe(true);
    expect(quoteShowUnit(true)).toBe(true);
    expect(quoteShowUnit(false)).toBe(false);
  });
});

describe("formatQuoteQty", () => {
  it("prints qty with the unit on the quotation", () => {
    expect(formatQuoteQty(2, "nos")).toBe("2 NOS");
  });

  it("prints qty only when the quotation hides units", () => {
    expect(formatQuoteQty(2, "nos", false)).toBe("2");
    expect(formatQuoteQty(2.5, "mtr", false)).toBe("2.5");
  });
});

describe("quoteShowHsn", () => {
  it("shows HSN unless the quotation explicitly hides it", () => {
    expect(quoteShowHsn(false)).toBe(false);
    expect(quoteShowHsn(undefined)).toBe(true);
  });
});

describe("formatTaxAnalysis", () => {
  it("mentions a header discount percent on the quotation", () => {
    expect(
      formatTaxAnalysis({
        taxable: 900,
        withGst: false,
        gstBuckets: [],
        gstAmount: 0,
        discountAmount: 100,
        discountPercent: 10,
      })
    ).toContain("Discount (10%): -100.00");
  });
});
