import { describe, expect, it } from "vitest";
import type { ProductMatch } from "@/lib/product-match";
import {
  acceptHighConfidenceSelections,
  extractCommercialAsks,
  reconcileSettledLineSelection,
  restoreVisibleLineSelection,
  visibleSuggestions,
} from "@/lib/rfq-workspace";

function match(id: string, score: number, name: string, description = ""): ProductMatch {
  return {
    score,
    matchedTokens: ["x"],
    product: {
      id,
      code: id,
      name,
      description,
      unit: "pcs",
      offerPrice: 100,
      lastPrice: null,
      taxRate: 18,
    },
  };
}

describe("reconcileSettledLineSelection", () => {
  it("KAN-64: drops a hidden auto-pick and selects the settled top match", () => {
    const hidden = match("147665", 40, "D-LINK DAP-1360", "wireless access point");
    const settled = match("155134", 55, "Ceiling Wi-Fi 6 access point", "Wi-Fi 6 access point");
    const result = reconcileSettledLineSelection({
      previousSelection: { 1: hidden.product.id },
      previousItems: [{ lineNumber: 1, matches: [hidden] }],
      nextItems: [
        {
          lineNumber: 1,
          requirementText: "ceiling-mount Wi-Fi 6 access point",
          matches: [settled],
        },
      ],
      extraIdsByLine: {},
      touchedLines: [],
    });
    expect(result.lineSelection[1]).toBe("155134");
    expect(result.pinFromPrevious).toHaveLength(0);
  });

  it("pins a product the user chose when re-rank drops it", () => {
    const chosen = match("147665", 40, "D-LINK DAP-1360");
    const other = match("155134", 55, "Other AP");
    const result = reconcileSettledLineSelection({
      previousSelection: { 1: chosen.product.id },
      previousItems: [{ lineNumber: 1, matches: [chosen, other] }],
      nextItems: [
        {
          lineNumber: 1,
          requirementText: "access point",
          matches: [other],
        },
      ],
      extraIdsByLine: {},
      touchedLines: [1],
    });
    expect(result.lineSelection[1]).toBe("147665");
    expect(result.pinFromPrevious[0]?.match.product.id).toBe("147665");
  });
});

describe("restoreVisibleLineSelection", () => {
  it("does not keep a saved id that is absent from the settled list", () => {
    const visible = match("155134", 60, "16 PORT SWITCH", "16 port gigabit switch");
    const selection = restoreVisibleLineSelection({
      saved: { 1: "147665" },
      items: [
        {
          lineNumber: 1,
          requirementText: "16-port switch",
          matches: [visible],
        },
      ],
      extraIdsByLine: {},
      autoWhenEmpty: false,
    });
    expect(selection[1]).toBe("155134");
  });
});

describe("restoreVisibleLineSelection", () => {
  it("does not auto-select a catalog match at zero stock", () => {
    const inStock = match("151042", 70, "16 PORT SWITCH IN STOCK", "16 port gigabit switch");
    const zeroStock = match("151041", 72, "16 PORT SWITCH", "16 port gigabit switch");
    const selection = restoreVisibleLineSelection({
      saved: {},
      items: [
        {
          lineNumber: 1,
          requirementText: "16-port switch",
          matches: [zeroStock, inStock],
        },
      ],
      extraIdsByLine: {},
      autoWhenEmpty: true,
      stockLookup: (id) => (id === "151041" ? 0 : 5),
    });
    expect(selection[1]).toBe("151042");
  });

  it("does not auto-select a spec-mismatched top match", () => {
    const mismatch = match("151454", 90, "151454 HDMI CABLE 5METER", "HDMI cable 5 meter");
    const selection = restoreVisibleLineSelection({
      saved: {},
      items: [
        {
          lineNumber: 1,
          requirementText: "QA test HDMI cable 3m",
          matches: [mismatch],
        },
      ],
      extraIdsByLine: {},
      autoWhenEmpty: true,
    });
    expect(selection[1]).toBeUndefined();
  });
});

describe("acceptHighConfidenceSelections", () => {
  it("KAN-58: accepts a strong compatible match and skips a spec mismatch", () => {
    const strong = match("151041", 70, "16 PORT SWITCH", "16 port gigabit switch");
    const mismatch = match("MON-32-4K", 80, "32 inch 4K Monitor", "32 inch 4K UHD monitor");
    const weak = match("maybe", 20, "16 port something", "16 port");
    const { acceptedLines, next } = acceptHighConfidenceSelections(
      [
        {
          lineNumber: 1,
          requirementText: "16-port switch",
          matches: [strong],
        },
        {
          lineNumber: 2,
          requirementText: "24-inch FHD monitor",
          matches: [mismatch],
        },
        {
          lineNumber: 3,
          requirementText: "odd cable",
          matches: [weak],
        },
      ],
      {}
    );
    expect(acceptedLines).toEqual([1]);
    expect(next[1]).toBe("151041");
    expect(next[2]).toBeUndefined();
    expect(next[3]).toBeUndefined();
  });
});

describe("visibleSuggestions", () => {
  it("keeps score order and still shows a selected item below the top scores", () => {
    const matches = [
      match("a", 112, "A"),
      match("b", 104, "B"),
      match("c", 94, "C"),
      match("d", 80, "D"),
      match("e", 47, "E"),
    ];
    const visible = visibleSuggestions(matches, "e", 4);
    expect(visible.map((row) => row.product.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("extractCommercialAsks", () => {
  it("keeps delivery, warranty, and GST lines from the source email", () => {
    const asks = extractCommercialAsks(
      "Please quote 10 monitors.\nDelivery to Pune within 2 weeks.\nWarranty: 3 years onsite.\nGST extra as applicable.\nThanks"
    );
    expect(asks.some((line) => /delivery/i.test(line))).toBe(true);
    expect(asks.some((line) => /warranty/i.test(line))).toBe(true);
    expect(asks.some((line) => /gst/i.test(line))).toBe(true);
  });
});
