import { describe, expect, it } from "vitest";
import {
  formatQuoteDateDisplay,
  formatQuoteInstant,
  formatQuoteQty,
  formatTaxAnalysis,
  parseQuoteDate,
  quoteShowHsn,
  quoteShowUnit,
  todayQuoteDateIso,
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

describe("quote dates use IST", () => {
  it("keeps the IST calendar day after midnight IST when the instant is still previous UTC day", () => {
    // 11 Nov 2026 03:35 IST = 10 Nov 2026 22:05 UTC
    const createdAt = new Date("2026-11-10T22:05:00.000Z");
    expect(formatQuoteInstant(createdAt, "dd/MM/yyyy")).toBe("11/11/2026");
    expect(formatQuoteInstant(createdAt, "yyyy-MM-dd")).toBe("2026-11-11");
    expect(todayQuoteDateIso(createdAt)).toBe("2026-11-11");
  });

  it("stores and displays a typed quote date on the same IST calendar day", () => {
    const issuedAt = parseQuoteDate("2026-11-11");
    expect(issuedAt).not.toBeNull();
    expect(formatQuoteInstant(issuedAt, "dd/MM/yyyy")).toBe("11/11/2026");
    expect(formatQuoteDateDisplay("2026-11-11")).toBe("11/11/2026");
  });
});
