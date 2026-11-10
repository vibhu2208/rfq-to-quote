import { describe, expect, it } from "vitest";
import {
  categoriesCompatible,
  isLooseVendorCategory,
} from "@/lib/categories";
import {
  pickOutreachCategory,
  productKeyForLine,
  resolveLineCategory,
  scoreVendorCategoryForItem,
} from "@/lib/vendor-match";

describe("resolveLineCategory", () => {
  it("uses item category when it maps to taxonomy", () => {
    expect(
      resolveLineCategory(
        { description: "Business Laptops", brand: null, category: "Computers & Laptops" },
        "Misc"
      )
    ).toBe("LAPTOP");
  });

  it("infers from description when category is missing", () => {
    expect(
      resolveLineCategory(
        { description: "CCTV / IP Cameras", brand: null, category: null },
        null
      )
    ).toBe("CCTV");
  });

  it("rewrites mislabeled Harman audio away from Ahuja", () => {
    expect(
      resolveLineCategory(
        {
          description: "Harman In Ceiling Speaker Two way ceiling speaker",
          brand: "Harman",
          category: "SOUND-SPEAKERS-AHUJA-",
        },
        "INTERACTIVE PANELS"
      )
    ).toBe("SPEAKER");
  });
});

describe("categoriesCompatible", () => {
  it("lets SPEAKER vendors match Ahuja-labeled audio lines", () => {
    expect(categoriesCompatible("SPEAKER", "SOUND-SPEAKERS-AHUJA-")).toBe(true);
    expect(categoriesCompatible("INTERACTIVE PANELS", "TFT")).toBe(true);
    expect(categoriesCompatible("NETWORKING", "SPEAKER")).toBe(false);
  });

  it("does not treat antivirus as interchangeable with CMS software", () => {
    expect(categoriesCompatible("Software", "ANTIVIRUS")).toBe(false);
  });
});

describe("isLooseVendorCategory", () => {
  it("treats Misc as keyword-only matchable", () => {
    expect(isLooseVendorCategory("Misc")).toBe(true);
    expect(isLooseVendorCategory("Hardware")).toBe(true);
    expect(isLooseVendorCategory("NETWORKING")).toBe(false);
    expect(isLooseVendorCategory("INTERACTIVE PANELS")).toBe(false);
  });
});

describe("scoreVendorCategoryForItem", () => {
  it("matches Misc vendors when product keywords overlap the RFQ line", () => {
    const scored = scoreVendorCategoryForItem({
      vendorCategory: {
        id: "v1",
        category: "Misc",
        subcategory: "",
        keywords: ["viewsonic", "technologies", "india"],
      },
      itemCategory: "INTERACTIVE PANELS",
      rfqCategory: "INTERACTIVE PANELS",
      rfqKeywords: ["interactive", "front", "panel", "viewsonic", "ifp"],
    });
    expect(scored).not.toBeNull();
    expect(scored?.category).toBe("INTERACTIVE PANELS");
    expect(scored?.matchedKeywords).toContain("viewsonic");
  });

  it("rejects Misc vendors with no keyword overlap", () => {
    expect(
      scoreVendorCategoryForItem({
        vendorCategory: {
          id: "v2",
          category: "Misc",
          subcategory: "",
          keywords: ["army", "canteen"],
        },
        itemCategory: "INTERACTIVE PANELS",
        rfqCategory: "INTERACTIVE PANELS",
        rfqKeywords: ["interactive", "front", "panel", "viewsonic", "ifp"],
      })
    ).toBeNull();
  });

  it("ignores weak company-name tokens like power/camera/zone", () => {
    expect(
      scoreVendorCategoryForItem({
        vendorCategory: {
          id: "v2b",
          category: "Misc",
          subcategory: "",
          keywords: ["best", "power", "equipments"],
        },
        itemCategory: "SPEAKER",
        rfqCategory: "SPEAKER",
        rfqKeywords: ["harman", "ceiling", "speaker", "power", "output"],
      })
    ).toBeNull();
  });

  it("ignores component-spec tokens like ram/ssd from IFP lines", () => {
    expect(
      scoreVendorCategoryForItem({
        vendorCategory: {
          id: "v2c",
          category: "Misc",
          subcategory: "",
          keywords: ["ram", "sons"],
        },
        itemCategory: "INTERACTIVE PANELS",
        rfqCategory: "INTERACTIVE PANELS",
        rfqKeywords: ["interactive", "panel", "viewsonic", "ram", "ssd", "wifi"],
      })
    ).toBeNull();
  });

  it("still rejects concrete category mismatches", () => {
    expect(
      scoreVendorCategoryForItem({
        vendorCategory: {
          id: "v3",
          category: "NETWORKING",
          subcategory: "CISCO",
          keywords: ["viewsonic"],
        },
        itemCategory: "INTERACTIVE PANELS",
        rfqCategory: "INTERACTIVE PANELS",
        rfqKeywords: ["interactive", "panel", "viewsonic"],
      })
    ).toBeNull();
  });
});

describe("productKeyForLine", () => {
  it("builds the same IFP key for match and history paths", () => {
    expect(
      productKeyForLine(
        {
          description:
            'INTERACTIVE FRONT PANEL VIEWSONIC 86" IFP with OPS i5',
          brand: "ViewSonic",
          category: "TFT",
        },
        "Monitors & Displays"
      )
    ).toMatch(/^ifp-viewsonic-86/);
  });
});

describe("pickOutreachCategory", () => {
  it("uses the dominant item category when the vendor covers it", () => {
    expect(
      pickOutreachCategory({
        items: [
          { description: "Desktop PCs", brand: null, category: "DESKTOP" },
          { description: "Desktop PCs", brand: null, category: "DESKTOP" },
          { description: "Business Laptops", brand: null, category: "LAPTOP" },
        ],
        vendorCategories: [
          { category: "DESKTOP", subcategory: "Office PCs", keywords: ["desktop"] },
          { category: "LAPTOP", subcategory: "", keywords: ["laptop"] },
        ],
        rfqCategory: "Misc",
      })
    ).toBe("DESKTOP");
  });

  it("falls back to the best vendor category keyword match", () => {
    expect(
      pickOutreachCategory({
        items: [
          { description: "HP Laser toner", brand: "HP", category: null },
        ],
        vendorCategories: [
          {
            category: "TONER",
            subcategory: "HP Toner",
            keywords: ["toner", "hp"],
          },
        ],
        rfqCategory: "Misc",
      })
    ).toBe("TONER");
  });
});
