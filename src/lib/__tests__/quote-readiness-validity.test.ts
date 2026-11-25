import { describe, expect, it } from "vitest";
import { collectReadinessGaps } from "@/lib/quote-readiness";

describe("collectReadinessGaps validity", () => {
  it("flags missing validity for ready-to-send", () => {
    const gaps = collectReadinessGaps({
      buyerCompany: "Acme",
      buyerAddress: "1 Main St",
      buyerState: "Delhi",
      validityMissing: true,
      lines: [
        {
          name: "Cable",
          unitPrice: 100,
          hsnCode: "8544",
          qty: 1,
          unit: "pcs",
        },
      ],
    });
    expect(gaps.some((g) => g.id === "validity")).toBe(true);
  });
});