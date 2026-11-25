import { describe, expect, it } from "vitest";
import { gstModeMismatchWarning } from "@/lib/quote-gst-guard";

describe("gstModeMismatchWarning", () => {
  it("flags manual IGST on intra-state supply", () => {
    const result = gstModeMismatchWarning({
      withGst: true,
      buyerState: "Uttar Pradesh",
      sellerState: "Uttar Pradesh",
      gstMode: "IGST",
    });
    expect(result.mismatch).toBe(true);
    expect(result.message).toMatch(/IGST/i);
  });

  it("flags manual CGST+SGST on inter-state supply", () => {
    const result = gstModeMismatchWarning({
      withGst: true,
      buyerState: "Maharashtra",
      sellerState: "Uttar Pradesh",
      gstMode: "CGST_SGST",
    });
    expect(result.mismatch).toBe(true);
    expect(result.message).toMatch(/CGST/i);
  });
});