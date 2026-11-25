import { describe, expect, it } from "vitest";
import {
  QuoteLineValidationError,
  sanitizeQuoteLinesForCreate,
} from "@/lib/quote-line-sanitize";

describe("sanitizeQuoteLinesForCreate", () => {
  it("rounds sell and line total half-up", () => {
    const [line] = sanitizeQuoteLinesForCreate([
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
    expect(line.unitPrice).toBe(1234.57);
    expect(line.lineTotal).toBe(1666.67);
  });

  it("rejects amounts that do not fit quote columns", () => {
    expect(() =>
      sanitizeQuoteLinesForCreate([
        {
          productId: null,
          description: "",
          aliasName: "Huge",
          qty: 1,
          unit: "nos",
          unitPrice: 99_999_999_999_999,
          taxRate: 18,
          lineTotal: 0,
          sortOrder: 0,
        },
      ])
    ).toThrow(QuoteLineValidationError);
  });
});