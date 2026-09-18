import { describe, expect, it } from "vitest";
import { rankProductsByQuery, scoreProductSearchHit, searchTokens } from "@/lib/product-search";
import { matchProductsToRfq, matchProductsToRfqItems } from "@/lib/product-match";
import type { Product } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

function fakeProduct(partial: Partial<Product> & Pick<Product, "id" | "code" | "name">): Product {
  return {
    description: "",
    unit: "pcs",
    uqc: "NOS",
    hsnCode: null,
    productType: "GOODS",
    basePrice: new Decimal(100),
    offerPrice: new Decimal(100),
    taxRate: new Decimal(18),
    taxCategory: "GST18",
    active: true,
    organisationId: "org1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe("product-search", () => {
  it("splits multi-word queries into tokens", () => {
    expect(searchTokens("  Dell  16GB ")).toEqual(["dell", "16gb"]);
  });

  it("ranks name matches above description-only matches", () => {
    const products = [
      { code: "X-1", name: "Other item", description: "mentions dell somewhere" },
      { code: "LAP-1", name: "Dell Latitude 16GB", description: "" },
      { code: "LAP-2", name: "HP EliteBook", description: "16gb ram" },
    ];
    const ranked = rankProductsByQuery(products, "dell 16gb");
    expect(ranked[0].code).toBe("LAP-1");
  });

  it("scores exact name highest", () => {
    const exact = scoreProductSearchHit(
      { code: "A", name: "CCTV Camera 2MP", description: "" },
      "CCTV Camera 2MP",
      ["cctv", "camera", "2mp"]
    );
    const partial = scoreProductSearchHit(
      { code: "B", name: "Dome Camera", description: "cctv camera 2mp kit" },
      "CCTV Camera 2MP",
      ["cctv", "camera", "2mp"]
    );
    expect(exact).toBeGreaterThan(partial);
  });
});

describe("matchProductsToRfq name matching", () => {
  it("surfaces catalog products whose name appears in the RFQ text", () => {
    const products = [
      fakeProduct({ id: "1", code: "CAB-1", name: "Cat6 Cable 305m", description: "network" }),
      fakeProduct({ id: "2", code: "LAP-9", name: "Dell Latitude 5420", description: "business laptop" }),
      fakeProduct({ id: "3", code: "MON-1", name: "24 inch Monitor", description: "display" }),
    ];

    const matches = matchProductsToRfq(products, {
      rawText: "Product / service needed: Need Dell Latitude 5420 for office, qty 5",
      subject: "Laptop request",
    });

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].product.code).toBe("LAP-9");
  });

  it("does not treat parsedSpecs JSON keys as keywords", () => {
    const products = [
      fakeProduct({ id: "1", code: "X-1", name: "Brand Model Widget", description: "generic" }),
      fakeProduct({ id: "2", code: "CCTV-1", name: "Hikvision Dome 2MP", description: "camera" }),
    ];

    const matches = matchProductsToRfq(products, {
      parsedSpecs: { brand: "Hikvision", model: "Dome", resolution: "2MP" },
      rawText: "Need Hikvision Dome 2MP camera",
    });

    expect(matches[0]?.product.code).toBe("CCTV-1");
    // "brand"/"model" alone should not make "Brand Model Widget" win
    expect(matches[0]?.product.code).not.toBe("X-1");
  });

  it("does not suggest a monitor for control panel enclosures (even if miscategorized)", () => {
    const products = [
      fakeProduct({
        id: "1",
        code: "MON-32-4K",
        name: "32 inch 4K Monitor",
        description: "32 inch 4K UHD monitor, HDMI/DP, for CCTV / editing",
      }),
      fakeProduct({
        id: "2",
        code: "MON-24-FHD",
        name: "24 inch Full HD Monitor",
        description: "Office monitor",
      }),
    ];

    const matches = matchProductsToRfq(products, {
      rawText: "Product / service needed: 2 Control Panel Enclosures",
      subject: "2 Control Panel Enclosures",
      // AI often maps "panel" → Monitors & Displays
      parsedCategory: "Monitors & Displays",
    });

    expect(matches).toEqual([]);
  });

  it("still finds a laptop if AI miscategorized it as monitors", () => {
    const products = [
      fakeProduct({
        id: "1",
        code: "MON-32-4K",
        name: "32 inch 4K Monitor",
        description: "monitor",
      }),
      fakeProduct({
        id: "2",
        code: "LAP-I5-14",
        name: "Laptop 14 inch Core i5",
        description: "business laptop",
      }),
    ];

    const matches = matchProductsToRfq(products, {
      rawText: "Need Laptop 14 inch Core i5",
      subject: "laptop request",
      parsedCategory: "Monitors & Displays",
    });

    expect(matches[0]?.product.code).toBe("LAP-I5-14");
  });

  it("still matches monitors when the customer asks for a monitor", () => {
    const products = [
      fakeProduct({
        id: "1",
        code: "MON-32-4K",
        name: "32 inch 4K Monitor",
        description: "32 inch 4K UHD monitor, HDMI/DP",
      }),
      fakeProduct({ id: "2", code: "CAB-1", name: "Cat6 Cable 305m", description: "network" }),
    ];

    const matches = matchProductsToRfq(products, {
      rawText: "Need a 32 inch 4K monitor for editing",
      subject: "4K monitor",
      parsedCategory: "Monitors & Displays",
    });

    expect(matches[0]?.product.code).toBe("MON-32-4K");
  });

  it("matches each requirement line independently for multi-product RFQs", () => {
    const products = [
      fakeProduct({ id: "1", code: "LAP-I5-14", name: "Laptop 14 inch Core i5", description: "business laptop" }),
      fakeProduct({ id: "2", code: "CAB-1", name: "Cat6 Cable 305m", description: "network cable" }),
      fakeProduct({ id: "3", code: "UPS-1KVA", name: "UPS 1KVA Online", description: "power backup" }),
    ];

    const itemMatches = matchProductsToRfqItems(products, {
      parsedSpecs: {
        items: [
          { description: "Laptop 14 inch Core i5", quantity: 5, unit: "pcs" },
          { description: "Cat6 Cable 305m", quantity: 10, unit: "pcs" },
          { description: "UPS 1KVA Online", quantity: 2, unit: "pcs" },
        ],
      },
    });

    expect(itemMatches).toHaveLength(3);
    expect(itemMatches[0].lineNumber).toBe(1);
    expect(itemMatches[0].requirement.quantity).toBe(5);
    expect(itemMatches[0].matches[0]?.product.code).toBe("LAP-I5-14");
    expect(itemMatches[1].matches[0]?.product.code).toBe("CAB-1");
    expect(itemMatches[2].matches[0]?.product.code).toBe("UPS-1KVA");
  });
});
