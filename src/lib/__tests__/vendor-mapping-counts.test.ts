import { describe, expect, it } from "vitest";
import {
  countNamedSubcategoryRows,
  countVendorMappingCategories,
  countVendorMappingSubcategories,
  isCategoryOnlyMapping,
  summarizeTaxonomyCoverage,
  vendorMappingGroupLabel,
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
    expect(
      countVendorMappingCategories([
        { category: "networking", subcategory: "DLINK" },
        { category: "NETWORKING", subcategory: "FIBER" },
      ])
    ).toBe(1);
  });

  it("does not count category-only rows as subcategories", () => {
    expect(countVendorMappingSubcategories(astekMaps)).toBe(3);
    expect(
      countVendorMappingSubcategories([{ category: "Misc", subcategory: "" }])
    ).toBe(0);
  });

  it("labels a category-only group as category-level", () => {
    expect(
      vendorMappingGroupLabel([{ category: "Misc", subcategory: "" }])
    ).toBe("Category-level");
    expect(vendorMappingGroupLabel(astekMaps.filter((row) => row.category === "NETWORKING"))).toBe(
      "3 subcategories"
    );
  });

  it("excludes blank subcategory buckets from named counts", () => {
    expect(
      countNamedSubcategoryRows([
        { subcategory: "" },
        { subcategory: "DLINK" },
        { subcategory: "FIBER" },
      ])
    ).toBe(2);
  });
});

describe("taxonomy coverage summary", () => {
  it("separates named subcategories, category-level links, and gaps", () => {
    const summary = summarizeTaxonomyCoverage([
      {
        category: "Misc",
        subcategories: [{ subcategory: "", vendorCount: 3099 }],
      },
      {
        category: "NETWORKING",
        subcategories: [
          { subcategory: "DLINK", vendorCount: 3 },
          { subcategory: "FIBER", vendorCount: 0 },
        ],
      },
      {
        category: "TFT",
        subcategories: [],
      },
      {
        category: "CABLE",
        subcategories: [],
      },
    ]);

    expect(summary).toMatchObject({
      categories: 4,
      namedSubcategories: 2,
      categoryLevelLinks: 3099,
      vendorLinks: 3102,
      categoriesWithNoNamedSubcategory: 3,
      categoriesWithNoVendors: 2,
      namedSubcategoriesWithNoVendor: 1,
    });
  });
});
