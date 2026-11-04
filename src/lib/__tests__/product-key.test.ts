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
    expect(isSpecificProductKey("printer-samsung-m2876nd")).toBe(true);
  });
});
