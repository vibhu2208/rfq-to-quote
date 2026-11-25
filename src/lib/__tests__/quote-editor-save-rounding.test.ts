import { describe, expect, it } from "vitest";
import { calculateQuoteTotals } from "@/lib/tax";
import { sanitizeQuoteLinesForCreate } from "@/lib/quote-line-sanitize";

describe("quote editor save rounding", () => {
  it("rounds sell half-up on the PUT/save path", () => {
    const sanitized = sanitizeQuoteLinesForCreate([
      {
        productId: null,
        description: "",
        aliasName: "Cable",
        qty: 1.5,
        unit: "nos",
        unitPrice: 1234.567,
        taxRate: 18,
        lineTotal: 0,
        sortOrder: 0,
        discountPercent: 10,
      },
    ]);

    const calc = calculateQuoteTotals({
      lines: sanitized.map((line) => ({
        qty: line.qty,
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
        discountPercent: line.discountPercent ?? 0,
      })),
      withGst: true,
      buyerState: "Maharashtra",
      sellerState: "Maharashtra",
    });

    expect(sanitized[0].unitPrice).toBe(1234.57);
    expect(sanitized[0].lineTotal).toBe(1666.67);
    expect(calc.lineTotals[0]).toBe(1666.67);
  });
});