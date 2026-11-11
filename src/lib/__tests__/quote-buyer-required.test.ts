import { describe, expect, it } from "vitest";
import {
  assertBuyerReadyForExport,
  BuyerRequiredError,
  buyerRequiredGaps,
  buyerRequiredMessage,
} from "@/lib/quote-buyer-required";

describe("buyerRequiredGaps", () => {
  it("returns empty when company, address, and state are set", () => {
    expect(
      buyerRequiredGaps({
        buyerCompany: "Acme",
        buyerAddress: "1 Main St",
        buyerState: "Maharashtra",
      })
    ).toEqual([]);
  });

  it("lists blank company, address, and state", () => {
    expect(
      buyerRequiredGaps({
        buyerCompany: "  ",
        buyerAddress: "",
        buyerState: null,
      })
    ).toEqual(["company name", "address", "state"]);
  });
});

describe("buyerRequiredMessage", () => {
  it("matches editor copy", () => {
    expect(buyerRequiredMessage(["address", "state"])).toBe(
      "Fill address, state before continuing."
    );
  });
});

describe("assertBuyerReadyForExport", () => {
  it("throws BuyerRequiredError when gaps remain", () => {
    expect(() =>
      assertBuyerReadyForExport({
        buyerCompany: "Acme",
        buyerAddress: "",
        buyerState: "",
      })
    ).toThrow(BuyerRequiredError);
    expect(() =>
      assertBuyerReadyForExport({
        buyerCompany: "Acme",
        buyerAddress: "",
        buyerState: "",
      })
    ).toThrow("Fill address, state before continuing.");
  });

  it("passes when all required fields are present", () => {
    expect(() =>
      assertBuyerReadyForExport({
        buyerCompany: "Acme",
        buyerAddress: "1 Main St",
        buyerState: "Maharashtra",
      })
    ).not.toThrow();
  });
});
