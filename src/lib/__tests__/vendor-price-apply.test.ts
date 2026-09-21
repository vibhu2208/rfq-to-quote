import { describe, expect, it } from "vitest";
import { applyAcceptedNegotiationDiscounts } from "@/lib/vendor-price-apply";

describe("applyAcceptedNegotiationDiscounts", () => {
  const previousLines = [
    {
      lineNumber: 4,
      description: "professional monitors",
      quantity: 12,
      unit: "units",
      unitPrice: 35666.67,
      lineTotal: 428000.04,
    },
  ];

  it("applies % discount stated in the vendor reply", () => {
    const applied = applyAcceptedNegotiationDiscounts({
      previousLines,
      negotiationNote: "price too high, need revised rate",
      negotiationEmailBody:
        "Could you please provide a revised per-line INR unit price?",
      vendorReplyText: "ok lets do in i will give you the 7% discount.",
    });

    expect(applied).not.toBeNull();
    expect(applied!.lines[0].unitPrice).toBeCloseTo(35666.67 * 0.93, 1);
    expect(applied!.total).toBeCloseTo(35666.67 * 0.93 * 12, 0);
  });

  it("falls back to admin negotiation % when vendor reply has none", () => {
    const applied = applyAcceptedNegotiationDiscounts({
      previousLines,
      negotiationNote: "ask 10% less on monitors",
      negotiationEmailBody: "Please reduce monitors by 10%.",
      vendorReplyText: "ok we can do that",
    });

    expect(applied).not.toBeNull();
    expect(applied!.lines[0].unitPrice).toBeCloseTo(35666.67 * 0.9, 1);
  });
});
