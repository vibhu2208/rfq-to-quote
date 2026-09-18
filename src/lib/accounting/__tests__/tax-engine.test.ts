import { describe, expect, it } from "vitest";
import { calculateDocumentTotals } from "@/lib/accounting/tax-engine";

describe("calculateDocumentTotals", () => {
  it("applies CGST/SGST for intra-state supply", () => {
    const result = calculateDocumentTotals({
      lines: [{ qty: 2, unitPrice: 500, taxRate: 18 }],
      sellerStateCode: "29",
      placeOfSupplyCode: "29",
      withGst: true,
    });

    expect(result.gstSplit).toBe("CGST_SGST");
    expect(result.subtotal).toBe(1000);
    expect(result.taxable).toBe(1000);
    expect(result.gstAmount).toBe(180);
    expect(result.cgstAmount).toBe(90);
    expect(result.sgstAmount).toBe(90);
    expect(result.igstAmount).toBe(0);
    expect(result.grandTotal).toBe(1180);
  });

  it("applies IGST for inter-state supply", () => {
    const result = calculateDocumentTotals({
      lines: [{ qty: 1, unitPrice: 1000, taxRate: 18 }],
      sellerStateCode: "29",
      placeOfSupplyCode: "27",
      withGst: true,
    });

    expect(result.gstSplit).toBe("IGST");
    expect(result.gstAmount).toBe(180);
    expect(result.cgstAmount).toBe(0);
    expect(result.sgstAmount).toBe(0);
    expect(result.igstAmount).toBe(180);
    expect(result.grandTotal).toBe(1180);
  });

  it("allocates header discount proportionally across lines", () => {
    const result = calculateDocumentTotals({
      lines: [
        { qty: 1, unitPrice: 600, taxRate: 18 },
        { qty: 1, unitPrice: 400, taxRate: 18 },
      ],
      sellerStateCode: "29",
      placeOfSupplyCode: "29",
      withGst: true,
      headerDiscountAmount: 100,
    });

    expect(result.subtotal).toBe(1000);
    expect(result.discountAmount).toBe(100);
    expect(result.taxable).toBe(900);
    expect(result.gstAmount).toBe(162);
    expect(result.grandTotal).toBe(1062);
  });

  it("taxes freight when freightTaxable is true", () => {
    const result = calculateDocumentTotals({
      lines: [{ qty: 1, unitPrice: 1000, taxRate: 18 }],
      sellerStateCode: "29",
      placeOfSupplyCode: "29",
      withGst: true,
      freightAmount: 100,
      freightTaxable: true,
      freightTaxRate: 18,
    });

    expect(result.freightAmount).toBe(100);
    expect(result.freightTaxAmount).toBe(18);
    expect(result.gstAmount).toBe(198);
    expect(result.cgstAmount).toBe(99);
    expect(result.sgstAmount).toBe(99);
    expect(result.grandTotal).toBe(1298);
  });

  it("excludes freight tax when freightTaxable is false", () => {
    const result = calculateDocumentTotals({
      lines: [{ qty: 1, unitPrice: 1000, taxRate: 18 }],
      sellerStateCode: "29",
      placeOfSupplyCode: "29",
      withGst: true,
      freightAmount: 100,
      freightTaxable: false,
    });

    expect(result.freightTaxAmount).toBe(0);
    expect(result.gstAmount).toBe(180);
    expect(result.grandTotal).toBe(1280);
  });
});
