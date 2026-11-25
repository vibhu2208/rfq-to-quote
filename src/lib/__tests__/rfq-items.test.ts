import { describe, expect, it } from "vitest";
import {
  correctItemQuantityUnit,
  extractRequirementsFromText,
  extractRfqItems,
  looksLikeMergedSummary,
  parseQuantityFromDescription,
  resolveParsedItems,
} from "@/lib/rfq-items";

const SAMPLE_EMAIL = `Greetings from Vaibhav Kaushik.

We currently have an IT hardware requirement and would like to invite you to share your best quotation for the following products:

• CCTV / IP Cameras – 10 Units
• Desktop PCs – 20 Units
• Business Laptops – 10 Units
• Monitors – 20 Units
• Network Switches – 5 Units
• Wi-Fi Routers / Access Points – 10 Units
• Printers – 5 Units
• UPS Systems – 20 Units`;

describe("parseQuantityFromDescription", () => {
  it("reads qty from free text such as HDMI cable 3m x 5", () => {
    expect(parseQuantityFromDescription("QA test HDMI cable 3m x 5")).toMatchObject({
      description: "QA test HDMI cable 3m",
      quantity: 5,
      unit: "pcs",
    });
  });
});

describe("extractRequirementsFromText", () => {
  it("parses bulleted product lists with quantities from email RFQs", () => {
    const items = extractRequirementsFromText(SAMPLE_EMAIL);

    expect(items).toHaveLength(8);
    expect(items[0]).toMatchObject({
      lineNumber: 1,
      description: "CCTV / IP Cameras",
      quantity: 10,
      unit: "pcs",
    });
    expect(items[1]).toMatchObject({ description: "Desktop PCs", quantity: 20 });
    expect(items[2]).toMatchObject({ description: "Business Laptops", quantity: 10 });
    expect(items[3]).toMatchObject({ description: "Monitors", quantity: 20 });
    expect(items[4]).toMatchObject({ description: "Network Switches", quantity: 5 });
    expect(items[5]).toMatchObject({
      description: "Wi-Fi Routers / Access Points",
      quantity: 10,
    });
    expect(items[6]).toMatchObject({ description: "Printers", quantity: 5 });
    expect(items[7]).toMatchObject({ description: "UPS Systems", quantity: 20 });
  });

  it("KAN-140: parses the live six-line semicolon enquiry verbatim", () => {
    const text =
      "16-port switch x3; CAT6 patch cord 1 m x50; 24-port patch panel x2; 1000 VA / 1 kVA UPS x5; 24-inch FHD IPS monitor, qty 15; 27-inch QHD monitor x4";
    const items = extractRequirementsFromText(text);
    expect(items).toHaveLength(6);
    expect(items.map((row) => row.quantity)).toEqual([3, 50, 2, 5, 15, 4]);
    expect(items[0].description).toMatch(/16-port switch/i);
    expect(items[3].description).toMatch(/UPS/i);
    expect(items[4].description).toMatch(/24-inch FHD IPS monitor/i);
    expect(items[5].description).toMatch(/27-inch QHD monitor/i);
  });

  it("parses comma- and semicolon-separated requirement lists", () => {
    const text =
      '16-port switch ×3, CAT6 patch cord 1 m ×50; 24-port patch panel ×2, UPS ×5, 24" monitor ×15, 27" monitor ×4';
    const items = extractRequirementsFromText(text);
    expect(items).toHaveLength(6);
    expect(items[0].description).toMatch(/switch/i);
    expect(items[5].quantity).toBe(4);
  });

  it("handles hyphen bullets and numbered lists", () => {
    const text = `- Cat6 Cable – 50 pcs
2. Dell Laptop – 3 units`;

    const items = extractRequirementsFromText(text);
    expect(items).toHaveLength(2);
    expect(items[0].description).toBe("Cat6 Cable");
    expect(items[1].description).toBe("Dell Laptop");
  });
});

describe("correctItemQuantityUnit", () => {
  it("treats Cat6 patch cable length as a spec, not the quantity unit", () => {
    expect(
      correctItemQuantityUnit("Cat6 patch cable 2 m", 40, "meters")
    ).toEqual({ quantity: 40, unit: "pcs" });
    expect(
      correctItemQuantityUnit("Cat6 patch cable 2 m x40", 40, "m")
    ).toEqual({ quantity: 40, unit: "pcs" });
  });

  it("keeps meters when buying continuous cable length", () => {
    expect(
      correctItemQuantityUnit("50 meters of Cat6 cable", 50, "meters")
    ).toEqual({ quantity: 50, unit: "meters" });
  });
});

describe("resolveParsedItems", () => {
  it("corrects AI meters unit on patch cables when keeping AI items", () => {
    const items = resolveParsedItems(
      [
        {
          description: "Cat6 patch cable 2 m",
          quantity: 40,
          unit: "meters",
          category: "CABLE",
        },
        {
          description: "24-inch FHD IPS monitor HDMI+DisplayPort",
          quantity: 15,
          unit: "pcs",
          category: "TFT",
        },
      ],
      "Please quote Cat6 patch cable 2 m x40 and 24-inch FHD IPS monitor HDMI+DisplayPort x15"
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      description: "Cat6 patch cable 2 m",
      quantity: 40,
      unit: "pcs",
    });
    expect(items[1].quantity).toBe(15);
  });

  it("prefers text parser when AI merged many products into one summary", () => {
    const merged = resolveParsedItems(
      [
        {
          description:
            "IT hardware requirement including CCTV cameras, desktop PCs, laptops, monitors, network switches, Wi-Fi routers, printers, and UPS systems.",
          quantity: 1,
          unit: "pcs",
        },
      ],
      SAMPLE_EMAIL
    );

    expect(merged).toHaveLength(8);
    expect(merged[0].description).toBe("CCTV / IP Cameras");
    expect(merged[0].quantity).toBe(10);
    expect(merged[7].description).toBe("UPS Systems");
    expect(merged[7].quantity).toBe(20);
  });

  it("keeps multiple AI items when text has no structured list", () => {
    const aiItems = [
      { description: "Dell Laptop", quantity: 5, unit: "pcs" },
      { description: "Cat6 Cable", quantity: 10, unit: "pcs" },
    ];

    expect(resolveParsedItems(aiItems, "Need 5 laptops and 10 cables")).toHaveLength(2);
  });
});

describe("extractRfqItems", () => {
  it("recovers lines from rawText when stored parse is a merged summary", () => {
    const items = extractRfqItems(
      {
        description:
          "IT hardware requirement including CCTV cameras, desktop PCs, laptops, monitors, network switches, Wi-Fi routers, printers, and UPS systems.",
        quantity: 1,
        unit: "pcs",
      },
      SAMPLE_EMAIL
    );

    expect(items).toHaveLength(8);
    expect(items[0].quantity).toBe(10);
    expect(items[7].quantity).toBe(20);
  });

  it("keeps spreadsheet unit prices on structured items", () => {
    const items = extractRfqItems({
      items: [
        {
          productName: "AERO Panel",
          code: "153002",
          quantity: 2,
          unit: "NOS",
          unitPrice: 42000,
        },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      description: "AERO Panel",
      code: "153002",
      quantity: 2,
      unitPrice: 42000,
    });
  });
});

describe("looksLikeMergedSummary", () => {
  it("detects collapsed multi-product descriptions", () => {
    expect(
      looksLikeMergedSummary(
        "IT hardware requirement including CCTV cameras, desktop PCs, laptops, monitors, network switches, Wi-Fi routers, printers, and UPS systems."
      )
    ).toBe(true);
    expect(looksLikeMergedSummary("Dell Latitude 5420")).toBe(false);
  });
});
