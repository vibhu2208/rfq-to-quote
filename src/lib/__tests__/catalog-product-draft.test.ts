import { describe, expect, it } from "vitest";
import { draftFromRequirement, suggestProductCode } from "@/lib/catalog-product-draft";

describe("suggestProductCode", () => {
  it("uses the client's item code when they sent one", () => {
    expect(suggestProductCode("24 Port Switch", "XSM4328FV")).toBe("XSM4328FV");
  });

  it("builds a catalog code from the client item name", () => {
    expect(suggestProductCode("Netgear 24 Port SFP Core Switch")).toBe(
      "NETGEAR-24-PORT-SFP-CORE"
    );
  });
});

describe("draftFromRequirement", () => {
  it("prefills catalog fields from the unmatched RFQ line", () => {
    const draft = draftFromRequirement({
      description: "Netgear 24 Port SFP Core Switch",
      unit: "No's",
      brand: "Netgear",
      model: "GS324",
      code: "XSM4328FV",
      extraNotes: "Core switch for HQ",
    });
    expect(draft.name).toBe("Netgear 24 Port SFP Core Switch");
    expect(draft.code).toBe("XSM4328FV");
    expect(draft.unit).toBe("nos");
    expect(draft.brand).toBe("Netgear");
    expect(draft.modelNo).toBe("GS324");
    expect(draft.description).toContain("Core switch for HQ");
    expect(draft.taxRate).toBe(18);
  });
});
