import { describe, expect, it } from "vitest";
import {
  formatQuoteDateDisplay,
  formatQuoteInstant,
  formatQuoteQty,
  formatQuoteRateLabel,
  formatQuoteUnit,
  formatTaxAnalysis,
  parseQuoteDate,
  quoteBuyerContactLine,
  quoteGstSplitFromAmounts,
  quoteBankDetailsLines,
  quoteContactFooterLines,
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

describe("formatQuoteUnit", () => {
  it("keeps Nos and Pcs distinct to match the editor selection", () => {
    expect(formatQuoteUnit("nos")).toBe("NOS");
    expect(formatQuoteUnit("pcs")).toBe("PCS");
    expect(formatQuoteUnit("Pcs")).toBe("PCS");
    expect(formatQuoteUnit("piece")).toBe("PCS");
  });
});

describe("formatQuoteQty", () => {
  it("prints qty with the unit on the quotation", () => {
    expect(formatQuoteQty(2, "nos")).toBe("2 NOS");
    expect(formatQuoteQty(50, "pcs")).toBe("50 PCS");
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

  it("names IGST on an interstate sale instead of generic GST", () => {
    const text = formatTaxAnalysis({
      taxable: 89850,
      withGst: true,
      gstBuckets: [[18, 16173]],
      gstAmount: 16173,
      gstSplit: "IGST",
    });
    expect(text).toContain("IGST@18% 16,173.00");
    expect(text).not.toMatch(/(^|\s)GST@18%/);
  });

  it("splits an intra-state bucket into CGST and SGST", () => {
    const text = formatTaxAnalysis({
      taxable: 1000,
      withGst: true,
      gstBuckets: [[18, 180]],
      gstAmount: 180,
      gstSplit: "CGST_SGST",
    });
    expect(text).toContain("CGST@9% 90.00");
    expect(text).toContain("SGST@9% 90.00");
  });

  it("keeps a generic GST label when the split is unknown", () => {
    expect(
      formatTaxAnalysis({
        taxable: 1000,
        withGst: true,
        gstBuckets: [[18, 180]],
        gstAmount: 180,
      })
    ).toContain("GST@18% 180.00");
  });
});

describe("formatQuoteRateLabel", () => {
  it("shows the list rate and the line discount", () => {
    expect(formatQuoteRateLabel(15000, 5)).toEqual({
      amount: "15,000.00",
      discountLabel: "less 5%",
    });
  });

  it("omits the discount note when the line is not discounted", () => {
    expect(formatQuoteRateLabel(14250, 0).discountLabel).toBeNull();
  });
});

describe("quoteBuyerContactLine", () => {
  it("drops blank phone and GSTIN instead of printing dangling labels", () => {
    expect(
      quoteBuyerContactLine({
        state: "Madhya Pradesh",
        phone: "  ",
        gstin: "",
      })
    ).toBe("Madhya Pradesh");
  });

  it("keeps phone and GSTIN when they are filled", () => {
    expect(
      quoteBuyerContactLine({
        state: "Madhya Pradesh",
        phone: "9999900000",
        gstin: "23AAAAA0000A1Z5",
      })
    ).toBe("Madhya Pradesh  M: 9999900000  GSTIN: 23AAAAA0000A1Z5");
  });

  it("returns nothing when state, phone, and GSTIN are all blank", () => {
    expect(quoteBuyerContactLine({ state: "", phone: null, gstin: undefined })).toBe("");
  });
});

describe("quoteGstSplitFromAmounts", () => {
  it("reads IGST from the stored tax amounts", () => {
    expect(
      quoteGstSplitFromAmounts({
        withGst: true,
        igstAmount: 16173,
        cgstAmount: 0,
        sgstAmount: 0,
      })
    ).toBe("IGST");
  });
});

describe("quote footer lines", () => {
  it("keeps all bank details on one line", () => {
    expect(
      quoteBankDetailsLines({
        bankName: "HDFC Bank",
        bankBranch: "Noida",
        bankIfsc: "HDFC0001234",
        bankAccount: "1234567890",
        bankAccountType: "Current",
      })
    ).toEqual({
      line1:
        "Bank Details: HDFC Bank  Branch: Noida  IFSC Code: HDFC0001234  A/C No: 1234567890  A/C Type: Current",
      line2: null,
    });
  });

  it("puts email and website on the second address line", () => {
    expect(
      quoteContactFooterLines({
        address: "Sector 62, Noida",
        phone: "0120-1234567",
        mobile: "9876543210",
        email: "sales@example.com",
        website: "www.example.com",
      })
    ).toEqual({
      line1: "Address: Sector 62, Noida | PH: 0120-1234567 | Mobile: 9876543210",
      line2: "Email: sales@example.com | Website: www.example.com",
    });
  });

  it("peels email/website out of a joined address string onto line 2", () => {
    expect(
      quoteContactFooterLines({
        address:
          "Sector 62, Noida | Email: sales@example.com | Website: www.example.com",
        phone: "0120-1234567",
      })
    ).toEqual({
      line1: "Address: Sector 62, Noida | PH: 0120-1234567",
      line2: "Email: sales@example.com | Website: www.example.com",
    });
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
