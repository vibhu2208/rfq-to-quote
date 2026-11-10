import { describe, expect, it } from "vitest";
import {
  catalogQueryRegex,
  isWeakCatalogMatch,
  rankProductsByQuery,
  scoreProductSearchHit,
  searchTokens,
} from "@/lib/product-search";
import {
  buildCatalogMatchContext,
  matchProductsToRfq,
  matchProductsToRfqItems,
  retrieveCatalogCandidates,
  wordWeight,
  WEIGHT_BRAND,
  WEIGHT_TYPE,
  tokenize,
} from "@/lib/product-match";
import type { Product } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

function fakeProduct(partial: Partial<Product> & Pick<Product, "id" | "code" | "name">): Product {
  return {
    description: "",
    unit: "pcs",
    uqc: "NOS",
    hsnCode: null,
    productType: "GOODS",
    sourceProductId: null,
    modelNo: null,
    partNo: null,
    commCode: null,
    category: null,
    subCategory: null,
    brand: null,
    batchNo: null,
    popularCode: null,
    photoPath: null,
    gstTaxName: null,
    mrp: null,
    lastPrice: null,
    lastPricedAt: null,
    openingStock: new Decimal(0),
    isStockable: true,
    sourceGender: null,
    masterData: {},
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

  it("builds a flexible whitespace regex from the typed requirement", () => {
    const re = catalogQueryRegex("Dell  16 GB");
    expect(re?.test("Dell Latitude 16 GB RAM")).toBe(true);
    expect(re?.test("HP printer")).toBe(false);
  });

  it("flags empty or low scores as a weak catalog match", () => {
    expect(isWeakCatalogMatch(0, 0)).toBe(true);
    expect(isWeakCatalogMatch(40, 3)).toBe(true);
    expect(isWeakCatalogMatch(120, 2)).toBe(false);
  });
});

describe("tokenize video port compounds", () => {
  it("splits HDMI+DisplayPort into separate port tokens", () => {
    const tokens = tokenize("24-inch FHD IPS monitor HDMI+DisplayPort");
    expect(tokens).toContain("hdmi");
    expect(tokens).toContain("displayport");
    expect(tokens).not.toContain("hdmi+displayport");
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

  it("prefers HDMI+DisplayPort catalog over HDMI+VGA for a DisplayPort RFQ", () => {
    const products = [
      fakeProduct({
        id: "vga",
        code: "MON-24-FHD",
        name: "24 inch Full HD Monitor",
        category: "TFT",
        description: "24 inch IPS FHD monitor, HDMI + VGA, 75Hz",
      }),
      fakeProduct({
        id: "dp",
        code: "MON-24-DP",
        name: "24 inch FHD IPS Monitor",
        category: "TFT",
        description: "24 inch IPS FHD monitor, HDMI + DisplayPort, 75Hz",
      }),
      fakeProduct({
        id: "dp-slash",
        code: "MON-32-4K",
        name: "32 inch 4K Monitor",
        category: "TFT",
        description: "32 inch 4K UHD monitor, HDMI/DP, for CCTV / editing",
      }),
    ];

    const itemMatches = matchProductsToRfqItems(products, {
      parsedSpecs: {
        items: [
          {
            description: "24-inch FHD IPS monitor HDMI+DisplayPort",
            quantity: 15,
            unit: "pcs",
            category: "TFT",
          },
        ],
      },
    });

    expect(itemMatches).toHaveLength(1);
    expect(itemMatches[0].matches[0]?.product.code).toBe("MON-24-DP");
    expect(
      itemMatches[0].matches.every((m) => m.product.code !== "MON-24-FHD")
    ).toBe(true);
  });

  it("still matches HDMI+VGA when the RFQ does not require DisplayPort", () => {
    const products = [
      fakeProduct({
        id: "vga",
        code: "MON-24-FHD",
        name: "24 inch Full HD Monitor",
        category: "TFT",
        description: "24 inch IPS FHD monitor, HDMI + VGA, 75Hz",
      }),
    ];

    const itemMatches = matchProductsToRfqItems(products, {
      parsedSpecs: {
        items: [
          {
            description: "24 inch FHD IPS monitor",
            quantity: 15,
            unit: "pcs",
            category: "TFT",
          },
        ],
      },
    });

    expect(itemMatches[0]?.matches[0]?.product.code).toBe("MON-24-FHD");
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

describe("weighted catalog retrieval (brand / type / IDF)", () => {
  it("weights catalog brands highest and type tokens above rare IDF words", () => {
    const products = [
      fakeProduct({
        id: "1",
        code: "IFP-1",
        name: "ViewSonic IFP 86",
        brand: "ViewSonic",
        category: "INTERACTIVE PANELS",
      }),
      fakeProduct({ id: "2", code: "147606", name: "MIC", description: "microphone" }),
    ];
    const ctx = buildCatalogMatchContext(products);
    expect(wordWeight("viewsonic", ctx)).toBe(WEIGHT_BRAND);
    expect(wordWeight("ifp", ctx)).toBe(WEIGHT_TYPE);
    expect(wordWeight("mic", ctx)).toBeLessThan(WEIGHT_TYPE);
  });

  it("ranks ViewSonic IFP above feature accessories listed in the same RFQ line", () => {
    const products = [
      fakeProduct({
        id: "ifp",
        code: "IFP-86-VS",
        name: "ViewSonic IFP 86 Interactive Panel",
        brand: "ViewSonic",
        category: "INTERACTIVE PANELS",
        description: "86 inch interactive front panel",
      }),
      fakeProduct({ id: "mic", code: "147606", name: "MIC", description: "mic accessory" }),
      fakeProduct({ id: "ops", code: "151334", name: "OPS", description: "ops module" }),
      fakeProduct({
        id: "ssd",
        code: "147444",
        name: "SSD 512GB",
        category: "SSD",
        description: "solid state drive",
      }),
      fakeProduct({
        id: "wifi",
        code: "151874",
        name: "WIFI CAMERA",
        description: "wifi camera module",
      }),
    ];

    const description =
      'INTERACTIVE FRONT PANEL VIEWSONIC 86" 8GB, 64GB IFP with OPS i5, 13GEN, 16GB RAM, 512GB SSD, Octa Core, Android 16 Upgradable, Inbuild OEM wifi, LAN, 50MP Camera, Mic Warranty 3Years, With Installation';

    const itemMatches = matchProductsToRfqItems(products, {
      parsedSpecs: {
        items: [
          {
            description,
            brand: "ViewSonic",
            category: "INTERACTIVE PANELS",
            quantity: 1,
            unit: "pcs",
          },
        ],
      },
    });

    expect(itemMatches).toHaveLength(1);
    expect(itemMatches[0].matches[0]?.product.code).toBe("IFP-86-VS");
    const topCodes = itemMatches[0].matches.slice(0, 4).map((m) => m.product.code);
    expect(topCodes[0]).toBe("IFP-86-VS");
  });

  it("still allows a short mic RFQ to match MIC", () => {
    const products = [
      fakeProduct({ id: "mic", code: "147606", name: "MIC", description: "microphone" }),
      fakeProduct({
        id: "ifp",
        code: "IFP-86-VS",
        name: "ViewSonic IFP 86",
        brand: "ViewSonic",
        category: "INTERACTIVE PANELS",
      }),
    ];

    const matches = matchProductsToRfq(products, {
      rawText: "Need mic",
      subject: "mic",
    });

    expect(matches[0]?.product.code).toBe("147606");
  });

  it("force-includes brand catalog rows into the top-20 window", () => {
    const products = [
      fakeProduct({
        id: "vs1",
        code: "VS-ODD",
        name: "VS-IFP8650",
        brand: "ViewSonic",
        category: "INTERACTIVE PANELS",
      }),
      ...Array.from({ length: 25 }, (_, i) =>
        fakeProduct({
          id: `noise-${i}`,
          code: `N-${i}`,
          name: `Accessory ${i} wifi camera mic ops ssd`,
          description: "wifi camera mic ops ssd ram",
        })
      ),
    ];

    const ctx = buildCatalogMatchContext(products);
    const keywords = tokenize(
      "VIEWSONIC interactive panel with wifi camera mic ops ssd"
    );
    const retrieved = retrieveCatalogCandidates(
      ctx,
      { keywords, parsedBrand: "ViewSonic", parsedCategory: "INTERACTIVE PANELS" },
      20
    );

    expect(retrieved.some((m) => m.product.code === "VS-ODD")).toBe(true);
  });
});
