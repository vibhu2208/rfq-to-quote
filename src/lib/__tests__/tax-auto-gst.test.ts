import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateQuoteTotals, resolveGstSplit } from "@/lib/tax";

describe("GST Auto interstate determination", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses IGST for Uttar Pradesh seller → Maharashtra buyer", () => {
    expect(resolveGstSplit(true, "Maharashtra", "Uttar Pradesh", "AUTO")).toBe(
      "IGST"
    );
    const calc = calculateQuoteTotals({
      lines: [{ qty: 1, unitPrice: 1000, taxRate: 18 }],
      withGst: true,
      buyerState: "Maharashtra",
      sellerState: "Uttar Pradesh",
      gstMode: "AUTO",
    });
    expect(calc.gstSplit).toBe("IGST");
    expect(calc.igstAmount).toBe(180);
    expect(calc.cgstAmount).toBe(0);
    expect(calc.sgstAmount).toBe(0);
  });

  it("uses CGST+SGST for same-state supply", () => {
    const calc = calculateQuoteTotals({
      lines: [{ qty: 1, unitPrice: 1000, taxRate: 18 }],
      withGst: true,
      buyerState: "Uttar Pradesh",
      sellerState: "Uttar Pradesh",
      gstMode: "AUTO",
    });
    expect(calc.gstSplit).toBe("CGST_SGST");
    expect(calc.cgstAmount).toBe(90);
    expect(calc.sgstAmount).toBe(90);
    expect(calc.igstAmount).toBe(0);
  });

  it("derives seller from COMPANY_GSTIN when sellerState is wrong/empty", async () => {
    vi.stubEnv("COMPANY_GSTIN", "09AANPA0445N1ZK");
    vi.stubEnv("SELLER_STATE", "");
    // Re-import company helpers after env stub for this process.
    const { getSellerStateCode, getCompanyConfig } = await import("@/lib/company");
    expect(getSellerStateCode()).toBe("09");
    expect(getCompanyConfig().sellerState).toBe("Uttar Pradesh");

    expect(resolveGstSplit(true, "Maharashtra", "", "AUTO")).toBe("IGST");
    expect(resolveGstSplit(true, "Maharashtra", "Maharashtra", "AUTO")).toBe(
      "CGST_SGST"
    );

    // Explicit wrong sellerState string still wins when provided as a real state;
    // callers should pass getCompanyConfig().sellerState (GSTIN-backed).
    const calc = calculateQuoteTotals({
      lines: [{ qty: 1, unitPrice: 1000, taxRate: 18 }],
      withGst: true,
      buyerState: "Maharashtra",
      sellerState: "",
      gstMode: "AUTO",
    });
    expect(calc.gstSplit).toBe("IGST");
    expect(calc.igstAmount).toBe(180);
  });
});
