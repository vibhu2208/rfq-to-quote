import { describe, expect, it } from "vitest";
import { quoteAmountBlockReason } from "@/lib/quote-amount-limits";
import { validateBuyerDetails, sanitizePhoneInput } from "@/lib/quote-buyer-fields";
import { hsnFieldError, sanitizeHsnInput } from "@/lib/hsn";
import { sanitizePercentDraft } from "@/lib/percent-input";
import {
  grossLineSubtotal,
  validateFixedDiscountAmount,
} from "@/lib/quote-discount";
import { collectReadinessGaps } from "@/lib/quote-readiness";
import {
  composeCommercialTerms,
  extractIndianState,
  extractWarrantyAsk,
  parseCommercialTerms,
} from "@/lib/quote-commercial";
import { describeGstAuto } from "@/lib/tax";

describe("quote amount limits", () => {
  it("names the line whose extended amount cannot be saved", () => {
    const reason = quoteAmountBlockReason({
      lines: [{ name: "Switch", qty: 2, unitPrice: 9_999_999_999_999 }],
      grandTotal: 1,
    });
    expect(reason).toMatch(/Switch/);
    expect(reason).toMatch(/sell price/i);
  });

  it("allows a normal quotation", () => {
    expect(
      quoteAmountBlockReason({
        lines: [{ qty: 2, unitPrice: 4500 }],
        grandTotal: 10620,
      })
    ).toBeNull();
  });
});

describe("buyer details", () => {
  it("requires company, state, and address and rejects a bad email and phone", () => {
    const errors = validateBuyerDetails({
      buyerCompany: "  ",
      buyerState: "",
      buyerAddress: "",
      buyerEmail: "gvhbjbjmnmknmk",
      buyerPhone: "gvhbjnbjmn0))))))",
    });
    expect(errors.buyerCompany).toMatch(/required/i);
    expect(errors.buyerState).toMatch(/required/i);
    expect(errors.buyerAddress).toMatch(/required/i);
    expect(errors.buyerEmail).toMatch(/email/i);
    expect(errors.buyerPhone).toMatch(/digits/i);
  });

  it("keeps a leading plus and digits in the phone field", () => {
    expect(sanitizePhoneInput("+91-98765 43210abc")).toBe("+919876543210");
  });
});

describe("HSN and percent drafts", () => {
  it("strips letters from HSN and flags a bad length", () => {
    expect(sanitizeHsnInput("cfvbhbhbjnt")).toBe("");
    expect(hsnFieldError("8517")).toBeNull();
    expect(hsnFieldError("851")).toMatch(/2, 4, 6, or 8/);
  });

  it("does not pad a single discount digit", () => {
    expect(sanitizePercentDraft("09")).toBe("9");
    expect(sanitizePercentDraft("9")).toBe("9");
  });
});

describe("discount baselines", () => {
  it("separates the gross sum from a discounted subtotal", () => {
    const lines = [
      { qty: 1, unitPrice: 40000, discountPercent: 0 },
      { qty: 1, unitPrice: 40000, discountPercent: 5 },
      { qty: 1, unitPrice: 13600, discountPercent: 0 },
    ];
    expect(grossLineSubtotal(lines)).toBe(93600);
    expect(validateFixedDiscountAmount(500, 93600).ok).toBe(true);
    expect(validateFixedDiscountAmount(100000, 93600).ok).toBe(false);
  });
});

describe("readiness gaps", () => {
  it("lists unpriced lines, buyer gaps, HSN, warranty, and stock", () => {
    const gaps = collectReadinessGaps({
      buyerCompany: "Cafe",
      buyerAddress: "",
      buyerState: "",
      warrantyAsked: true,
      stockByProductId: { p1: 0 },
      lines: [
        {
          name: "Switch",
          unitPrice: 0,
          hsnCode: "",
          warrantyQty: 0,
          productId: "p1",
        },
      ],
    });
    expect(gaps.map((gap) => gap.id)).toEqual([
      "buyer",
      "price-0",
      "hsn-0",
      "stock-0",
      "warranty-0",
    ]);
  });

  it("still flags a line with no warranty when another line has one", () => {
    const gaps = collectReadinessGaps({
      buyerCompany: "Cafe",
      buyerAddress: "1 Road",
      buyerState: "Madhya Pradesh",
      warrantyAsked: true,
      lines: [
        { name: "Switch", unitPrice: 100, hsnCode: "8517", warrantyQty: 1 },
        { name: "Cable", unitPrice: 20, hsnCode: "8544", warrantyQty: 0 },
      ],
    });
    expect(gaps.map((gap) => gap.id)).toEqual(["warranty-1"]);
  });
});

describe("commercial defaults", () => {
  it("reads payment, validity, and delivery without inventing an address", () => {
    const parsed = parseCommercialTerms("Payment Terms: Against Delivery");
    expect(parsed.paymentTerms).toBe("Against Delivery");
    expect(parsed.validity).toBe("");
    expect(parsed.delivery).toBe("");
    expect(composeCommercialTerms({ ...parsed, validity: "15 days" })).toMatch(
      /Validity: 15 days/
    );
  });

  it("finds a warranty ask and a state name in RFQ text", () => {
    const ask = extractWarrantyAsk(
      "Please include 2 years onsite warranty. Ship to Madhya Pradesh."
    );
    expect(ask).toMatchObject({ qty: 2, unit: "years", service: "onsite" });
    expect(
      extractIndianState("Company is in Madhya Pradesh, city not given")
    ).toBe("Madhya Pradesh");
  });
});

describe("GST auto hint", () => {
  it("explains the intra-state fallback when the buyer state is blank", () => {
    expect(describeGstAuto("", "Maharashtra")).toMatch(/no buyer state/i);
  });
});
