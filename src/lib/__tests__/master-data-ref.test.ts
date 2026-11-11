import { describe, expect, it } from "vitest";
import { catalogProductRefLabel } from "@/lib/master-data";

describe("catalogProductRefLabel", () => {
  it("prefers sourceProductId over code and includes name", () => {
    expect(
      catalogProductRefLabel({
        sourceProductId: "PID-100",
        code: "SKU-1",
        name: "PoE Switch 24P",
      })
    ).toBe("PID-100 · PoE Switch 24P");
  });

  it("falls back to code when sourceProductId is missing", () => {
    expect(
      catalogProductRefLabel({
        code: "SKU-1",
        name: "Laptop 14\"",
      })
    ).toBe('SKU-1 · Laptop 14"');
  });

  it("returns Mapped product when nothing is available", () => {
    expect(catalogProductRefLabel({})).toBe("Mapped product");
  });
});
