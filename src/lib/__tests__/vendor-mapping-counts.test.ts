import { describe, expect, it } from "vitest";
import {
  countVendorMappingCategories,
  countVendorMappingSubcategories,
  isCategoryOnlyMapping,
} from "@/lib/vendor-mapping-counts";

describe("vendor mapping counts", () => {
  const astekMaps = [
    { category: "Misc", subcategory: "" },
    { category: "NETWORKING", subcategory: "DLINK" },
    { category: "NETWORKING", subcategory: "FIBER" },
    { category: "NETWORKING", subcategory: "NETGEAR" },
  ];

  it("treats empty/whitespace subcategory as category-only", () => {
    expect(isCategoryOnlyMapping({ subcategory: "" })).toBe(true);
    expect(isCategoryOnlyMapping({ subcategory: "   " })).toBe(true);
    expect(isCategoryOnlyMapping({ subcategory: "DLINK" })).toBe(false);
  });

  it("counts unique categories, not mapping rows", () => {
    expect(countVendorMappingCategories(astekMaps)).toBe(2);
  });

  it("does not count category-only rows as subcategories", () => {
    expect(countVendorMappingSubcategories(astekMaps)).toBe(3);
    expect(
      countVendorMappingSubcategories([{ category: "Misc", subcategory: "" }])
    ).toBe(0);
  });
});
