import { describe, expect, it } from "vitest";
import { formatQuoteTaxAnalysis } from "@/lib/quote-tax-analysis";

describe("formatQuoteTaxAnalysis", () => {
  it("includes freight GST in CGST/SGST when freight is taxed", () => {
    const text = formatQuoteTaxAnalysis({
      calc: {
        lineTotals: [10000],
        subtotal: 10000,
        discountAmount: 0,
        taxable: 10500,
        gstAmount: 1890,
        cgstAmount: 945,
        sgstAmount: 945,
        igstAmount: 0,
        gstSplit: "CGST_SGST",
        otherTaxAmount: 0,
        deliveryCharge: 500,
        grandTotal: 12390,
      },
      withGst: true,
      lines: [{ qty: 1, unitPrice: 10000, taxRate: 18, discountPercent: 0 }],
      discountPercent: 0,
    });

    expect(text).toContain("Freight: 500.00");
    expect(text).toContain("CGST");
    expect(text).toContain("945.00");
    expect(text).toContain("SGST");
  });
});