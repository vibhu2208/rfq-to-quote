import { describe, expect, it } from "vitest";
import {
  extractRequirementsFromText,
  extractRfqItems,
  looksLikeMergedSummary,
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

  it("handles hyphen bullets and numbered lists", () => {
    const text = `- Cat6 Cable – 50 pcs
2. Dell Laptop – 3 units`;

    const items = extractRequirementsFromText(text);
    expect(items).toHaveLength(2);
    expect(items[0].description).toBe("Cat6 Cable");
    expect(items[1].description).toBe("Dell Laptop");
  });
});

describe("resolveParsedItems", () => {
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
