import { describe, expect, it } from "vitest";
import {
  canonicalizeProductCategory,
  dominantProductCategory,
  inferProductCategoryFromText,
  normalizeParsedItemCategories,
  normalizeStoredRfqCategories,
  resolveProductCategory,
  UNCATEGORIZED_CATEGORY,
} from "@/lib/categories";

describe("canonicalizeProductCategory", () => {
  it("maps legacy AI labels onto the taxonomy", () => {
    expect(canonicalizeProductCategory("CCTV & Surveillance")).toBe("CCTV");
    expect(canonicalizeProductCategory("Computers & Laptops")).toBe("LAPTOP");
    expect(canonicalizeProductCategory("Printers & Scanners")).toBe("PRINTER");
    expect(canonicalizeProductCategory("Monitors & Displays")).toBe("TFT");
    expect(canonicalizeProductCategory("General / Uncategorized")).toBeNull();
  });

  it("accepts exact and alias labels", () => {
    expect(canonicalizeProductCategory("laptop")).toBe("LAPTOP");
    expect(canonicalizeProductCategory("DESKTOP")).toBe("DESKTOP");
    expect(canonicalizeProductCategory("Business Laptops")).toBe("LAPTOP");
  });
});

describe("inferProductCategoryFromText", () => {
  it("infers from product descriptions", () => {
    expect(inferProductCategoryFromText("CCTV / IP Cameras")).toBe("CCTV");
    expect(inferProductCategoryFromText("Desktop PCs")).toBe("DESKTOP");
    expect(inferProductCategoryFromText("Business Laptops")).toBe("LAPTOP");
    expect(inferProductCategoryFromText("HP LaserJet printer")).toBe("PRINTER");
    expect(
      inferProductCategoryFromText(
        'INTERACTIVE FRONT PANEL VIEWSONIC 86" 8GB, 64GB IFP with OPS i5'
      )
    ).toBe("INTERACTIVE PANELS");
    expect(
      inferProductCategoryFromText(
        'Harman In Ceiling Speaker Two way ceiling speaker having 6.5" driver'
      )
    ).toBe("SPEAKER");
    expect(
      inferProductCategoryFromText(
        "Phillips Camera Voice tracking: The built-in 6-mic array"
      )
    ).toBe("CAMERA- Philips-");
    expect(
      inferProductCategoryFromText(
        "Aero CMS Software Software per year per screen"
      )
    ).toBe("Software");
    expect(
      inferProductCategoryFromText("Cables All cables and connectors")
    ).toBe("CABLE");
    expect(
      inferProductCategoryFromText("Installation/Testing / Calibration Charges")
    ).toBe("Services");
  });

  it("prefers specific categories over broad parents", () => {
    expect(inferProductCategoryFromText("HP toner for LaserJet printer")).toBe(
      "TONER"
    );
    expect(inferProductCategoryFromText("Laptop bag")).toBe("BAG");
    expect(inferProductCategoryFromText("Laptop RAM 16GB")).toBe("RAM");
    expect(inferProductCategoryFromText("Lenovo server rack")).toBe(
      "LENOVO SERVER"
    );
    expect(inferProductCategoryFromText("Speaker for 86 inch IFP")).toBe(
      "SPEAKER"
    );
    expect(
      inferProductCategoryFromText("Installation/Testing of interactive panel")
    ).toBe("Services");
    expect(inferProductCategoryFromText("Jabra speakerphone")).toBe("SPEAKER");
    expect(
      resolveProductCategory(
        "TFT",
        'INTERACTIVE FRONT PANEL VIEWSONIC 86" IFP'
      )
    ).toBe("INTERACTIVE PANELS");
    // AI often mislabels Harman audio as the Ahuja taxonomy row.
    expect(
      resolveProductCategory(
        "SOUND-SPEAKERS-AHUJA-",
        "Harman In Ceiling Speaker Two way ceiling speaker"
      )
    ).toBe("SPEAKER");
    expect(
      resolveProductCategory(
        "SOUND-SPEAKERS-AHUJA-",
        "Phillips Speaker Phone Speakerphone, 4 Mic arrays"
      )
    ).toBe("SPEAKER");
  });

  it("does not fuzzy-map short junk labels", () => {
    expect(canonicalizeProductCategory("pri")).toBeNull();
    expect(canonicalizeProductCategory("ice")).toBeNull();
  });
});

describe("resolveProductCategory", () => {
  it("prefers canonical labels then description cues", () => {
    expect(resolveProductCategory("CCTV & Surveillance")).toBe("CCTV");
    expect(resolveProductCategory(null, "Need 10 laptops")).toBe("LAPTOP");
    expect(resolveProductCategory("Misc", "random stuff")).toBe(
      UNCATEGORIZED_CATEGORY
    );
  });
});

describe("dominantProductCategory", () => {
  it("picks the most common concrete category", () => {
    expect(
      dominantProductCategory(["LAPTOP", "DESKTOP", "LAPTOP", "Misc"])
    ).toBe("LAPTOP");
  });
});

describe("normalizeParsedItemCategories", () => {
  it("fixes multi-product IFP RFQs away from Monitors & Displays", () => {
    const result = normalizeParsedItemCategories(
      [
        {
          description:
            'INTERACTIVE FRONT PANEL VIEWSONIC 86" IFP with OPS i5',
          quantity: 12,
          category: null,
        },
        {
          description:
            'INTERACTIVE FRONT PANEL VIEWSONIC 86" IFP with OPS i5',
          quantity: 2,
          category: null,
        },
        {
          description: "Harman In Ceiling Speaker",
          quantity: 10,
          category: null,
        },
        {
          description: "Aero CMS Software per screen",
          quantity: 14,
          category: null,
        },
        {
          description: "Cables All cables and connectors",
          quantity: 1,
          category: null,
        },
        {
          description: "Installation/Testing / Calibration Charges",
          quantity: 1,
          category: null,
        },
      ],
      "Monitors & Displays"
    );

    expect(result.items[0].category).toBe("INTERACTIVE PANELS");
    expect(result.items[2].category).toBe("SPEAKER");
    expect(result.items[3].category).toBe("Software");
    expect(result.items[4].category).toBe("CABLE");
    expect(result.items[5].category).toBe("Services");
    // IFP qty 14 ties software qty 14; IFP has more lines → wins
    expect(result.productCategory).toBe("INTERACTIVE PANELS");
  });
});

describe("normalizeStoredRfqCategories", () => {
  it("rewrites legacy header category using item descriptions", () => {
    const result = normalizeStoredRfqCategories({
      parsedCategory: "Monitors & Displays",
      parsedSpecs: {
        items: [
          {
            description: 'INTERACTIVE FRONT PANEL VIEWSONIC 86" IFP',
            quantity: 12,
          },
        ],
      },
    });
    expect(result.changed).toBe(true);
    expect(result.parsedCategory).toBe("INTERACTIVE PANELS");
  });

  it("does not invent Misc for unparsed RFQs", () => {
    const result = normalizeStoredRfqCategories({
      parsedCategory: null,
      parsedSpecs: null,
    });
    expect(result.parsedCategory).toBeNull();
    expect(result.changed).toBe(false);
  });
});
