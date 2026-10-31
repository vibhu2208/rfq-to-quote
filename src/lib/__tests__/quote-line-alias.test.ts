import { describe, expect, it } from "vitest";
import {
  applyCatalogNamesToAliases,
  quoteLineAliasFromClient,
  quoteLinePresentation,
  requirementDescriptionForProduct,
  restoreLineAliases,
  snapshotLineAliases,
} from "@/lib/quote-line-alias";
import { extractRfqItems } from "@/lib/rfq-items";

describe("quoteLineAliasFromClient", () => {
  it("keeps the name the client wrote instead of the catalog product name", () => {
    expect(
      quoteLineAliasFromClient("Office laptop", "Laptop 14 inch Core i5")
    ).toBe("Office laptop");
  });

  it("falls back to the catalog name when the client left the name blank", () => {
    expect(quoteLineAliasFromClient("  ", "UPS 1KVA Online")).toBe("UPS 1KVA Online");
    expect(quoteLineAliasFromClient(undefined, "Cat6 Cable 305m")).toBe("Cat6 Cable 305m");
  });
});

describe("requirementDescriptionForProduct", () => {
  const requirements = [
    { description: "Office laptop" },
    { description: "Network cable" },
    { description: "Online UPS" },
  ];
  const topMatchProductIds = ["lap", "cab", "ups"];

  it("uses the requirement whose catalog match is this product, even if a line was skipped", () => {
    const claimed = new Set<number>();
    expect(
      requirementDescriptionForProduct({
        productId: "lap",
        lineIndex: 0,
        requirements,
        topMatchProductIds,
        claimed,
      })
    ).toBe("Office laptop");
    expect(
      requirementDescriptionForProduct({
        productId: "ups",
        lineIndex: 1,
        requirements,
        topMatchProductIds,
        claimed,
      })
    ).toBe("Online UPS");
  });
});

describe("extractRfqItems client wording", () => {
  it("keeps the client's product name and does not prepend a guessed brand", () => {
    const items = extractRfqItems({
      items: [
        {
          productName: "Office laptop",
          brand: "Dell",
          code: "LAP-I5-14",
          quantity: 5,
          unit: "pcs",
        },
      ],
    });
    expect(items[0].description).toBe("Office laptop");
    expect(items[0].code).toBe("LAP-I5-14");
  });

  it("keeps extra description and code off the item name", () => {
    const items = extractRfqItems({
      items: [
        {
          productName: "24 Port SFP Core Switch",
          description: "Core switch for HQ",
          brand: "Netgear",
          code: "XSM4328FV",
          unit: "No's",
          quantity: 2,
        },
      ],
    });
    expect(items[0].description).toBe("24 Port SFP Core Switch");
    expect(items[0].extraNotes).toBe("Core switch for HQ");
    expect(items[0].brand).toBe("Netgear");
    expect(items[0].code).toBe("XSM4328FV");
    expect(items[0].unit).toBe("No's");
  });
});

describe("quoteLinePresentation", () => {
  it("uses the client's item name and unit, and puts code/model/catalog details in description", () => {
    const line = quoteLinePresentation({
      clientName: "Netgear 24 Port SFP Core Switch",
      clientCode: "NG-SFP-24",
      clientModel: "GS324",
      clientBrand: "Netgear",
      clientUnit: "No's",
      catalogName: "Netgear GS324 24 Port Giga Switch",
      catalogDescription: "24 port gigabit switch",
      catalogUnit: "pcs",
    });
    expect(line.aliasName).toBe("Netgear 24 Port SFP Core Switch");
    expect(line.unit).toBe("nos");
    expect(line.description).toContain("NG-SFP-24");
    expect(line.description).toContain("GS324");
    expect(line.description).toContain("24 port gigabit switch");
    expect(line.description).not.toContain("Netgear GS324 24 Port Giga Switch");
  });

  it("keeps a spreadsheet box unit instead of the catalog pcs unit", () => {
    const line = quoteLinePresentation({
      clientName: "Cat6 cable",
      clientUnit: "box",
      catalogName: "Cat6 Cable 305m",
      catalogDescription: "305m box",
      catalogUnit: "pcs",
    });
    expect(line.aliasName).toBe("Cat6 cable");
    expect(line.unit).toBe("box");
  });

  it("puts company, extra description, and code in description, not the item name", () => {
    const line = quoteLinePresentation({
      clientName: "24 Port SFP Core Switch",
      clientBrand: "Netgear",
      clientCode: "XSM4328FV",
      extraNotes: "Core switch for HQ",
      clientUnit: "Nos",
      catalogName: "Netgear GS324 24 Port Giga Switch",
      catalogUnit: "pcs",
    });
    expect(line.aliasName).toBe("24 Port SFP Core Switch");
    expect(line.unit).toBe("nos");
    expect(line.description).toContain("XSM4328FV");
    expect(line.description).toContain("Netgear");
    expect(line.description).toContain("Core switch for HQ");
  });
});

describe("Use names / revert aliases", () => {
  const lines = [
    { key: "a", aliasName: "Netgear 24 Port SFP Core Switch", catalogName: "Netgear GS324" },
    { key: "b", aliasName: "D Link Cat6 UTP Cable", catalogName: "Cat6 Cable 305m" },
  ];

  it("copies catalog names onto the quote, then restores the client names", () => {
    const snapshot = snapshotLineAliases(lines);
    const named = applyCatalogNamesToAliases(lines);
    expect(named.map((l) => l.aliasName)).toEqual(["Netgear GS324", "Cat6 Cable 305m"]);
    expect(restoreLineAliases(named, snapshot).map((l) => l.aliasName)).toEqual([
      "Netgear 24 Port SFP Core Switch",
      "D Link Cat6 UTP Cable",
    ]);
  });

  it("leaves lines added after Use names unchanged on revert", () => {
    const snapshot = snapshotLineAliases(lines);
    const withExtra = [
      ...applyCatalogNamesToAliases(lines),
      { key: "c", aliasName: "New line", catalogName: "New catalog" },
    ];
    const restored = restoreLineAliases(withExtra, snapshot);
    expect(restored[2].aliasName).toBe("New line");
  });
});
