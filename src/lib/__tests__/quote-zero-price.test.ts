import { describe, expect, it } from "vitest";
import {
  confirmZeroPricedExport,
  zeroPricedExportMessage,
  zeroPricedQuoteLines,
} from "@/lib/quote-zero-price";

describe("zeroPricedQuoteLines", () => {
  it("flags named lines whose net rate is zero and ignores blank placeholders", () => {
    expect(
      zeroPricedQuoteLines([
        { aliasName: "Access point", qty: 1, unitPrice: 0 },
        { aliasName: "Switch", qty: 2, unitPrice: 4500, discountPercent: 0 },
        { description: "", qty: 1, unitPrice: 0 },
        { aliasName: "Monitor", qty: 1, unitPrice: 1000, discountPercent: 100 },
      ])
    ).toEqual([
      { name: "Line 1: Access point" },
      { name: "Line 4: Monitor" },
    ]);
  });

  it("does not confirm when every named line has a rate", () => {
    const ask = () => {
      throw new Error("should not ask");
    };
    expect(
      confirmZeroPricedExport([{ aliasName: "Switch", qty: 1, unitPrice: 10 }], ask)
    ).toBe(true);
  });

  it("lets the user continue or cancel a zero-priced export", () => {
    const lines = [{ aliasName: "Access point", qty: 1, unitPrice: 0 }];
    expect(zeroPricedExportMessage(zeroPricedQuoteLines(lines))).toContain(
      "Zero rates are allowed"
    );
    expect(confirmZeroPricedExport(lines, () => true)).toBe(true);
    expect(confirmZeroPricedExport(lines, () => false)).toBe(false);
  });
});
