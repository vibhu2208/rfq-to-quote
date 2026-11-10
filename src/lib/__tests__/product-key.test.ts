import { describe, expect, it } from "vitest";
import {
  isSpecificProductKey,
  normalizeProductKey,
} from "@/lib/product-key";

describe("normalizeProductKey", () => {
  it("builds a specific key for a Samsung printer model", () => {
    const key = normalizeProductKey({
      parsedCategory: "Printers & Scanners",
      subject: "Samsung M2876ND Printer",
      rawText: "i need Samsung M2876ND Printer",
    });
    expect(key).toContain("printer");
    expect(key).toContain("samsung");
    expect(key).toContain("m2876nd");
    expect(isSpecificProductKey(key)).toBe(true);
  });

  it("does not treat category-only keys as specific", () => {
    expect(isSpecificProductKey("printers")).toBe(false);
    expect(isSpecificProductKey("general")).toBe(false);
    expect(isSpecificProductKey("printer")).toBe(false);
    expect(isSpecificProductKey("laptop-dell")).toBe(false);
    expect(isSpecificProductKey("printer-hp")).toBe(false);
    expect(isSpecificProductKey("printer-samsung-m2876nd")).toBe(true);
    expect(isSpecificProductKey("ifp-viewsonic-86-ops")).toBe(true);
  });

  it("builds an IFP key, not monitor-microsoft-*", () => {
    const key = normalizeProductKey({
      parsedCategory: "INTERACTIVE PANELS",
      subject: "Microsoft Teams Room quotation",
      parsedSpecs: {
        brand: "ViewSonic",
        description:
          'INTERACTIVE FRONT PANEL VIEWSONIC 86" 8GB, 64GB IFP with OPS i5, 50MP Camera, Mic Warranty',
        quantity: 150,
      },
      rawText:
        'Microsoft Teams room needs INTERACTIVE FRONT PANEL VIEWSONIC 86" IFP with OPS, 50MP Camera',
    });
    expect(key).toMatch(/^ifp-/);
    expect(key).toContain("viewsonic");
    expect(key).toContain("86");
    expect(key).not.toContain("monitor");
    expect(key).not.toContain("microsoft");
    expect(key).not.toContain("50mp");
    expect(key).not.toContain("150");
    expect(isSpecificProductKey(key)).toBe(true);
  });

  it("keeps interactive display wording on the IFP path", () => {
    const key = normalizeProductKey({
      parsedCategory: null,
      subject: "Microsoft Teams interactive display",
      parsedSpecs: {
        description: '86" Interactive Display ViewSonic with OPS',
      },
    });
    expect(key).toMatch(/^ifp-/);
    expect(key).toContain("viewsonic");
    expect(key).not.toContain("microsoft");
  });
});
