import { describe, expect, it } from "vitest";
import {
  nextDistinctVendorCountAfterMap,
  nextDistinctVendorCountAfterUnlink,
  vendorHasCategoryMapping,
} from "@/lib/vendor-taxonomy-counts";

describe("vendorHasCategoryMapping", () => {
  const maps = [
    { category: "NETWORKING", subcategory: "DLINK" },
    { category: "NETWORKING", subcategory: "FIBER" },
    { category: "NETWORKING", subcategory: "NETGEAR" },
    { category: "Misc", subcategory: "" },
  ];

  it("detects remaining maps under a category after excluding one sub", () => {
    expect(
      vendorHasCategoryMapping(maps, "NETWORKING", {
        excludeSubcategory: "FIBER",
      })
    ).toBe(true);
    expect(
      vendorHasCategoryMapping(
        [{ category: "NETWORKING", subcategory: "FIBER" }],
        "NETWORKING",
        { excludeSubcategory: "FIBER" }
      )
    ).toBe(false);
  });

  it("matches post-unlink vendor payloads with no exclude", () => {
    expect(
      vendorHasCategoryMapping(
        [{ category: "NETWORKING", subcategory: "DLINK" }],
        "NETWORKING"
      )
    ).toBe(true);
  });
});

describe("distinct category vendor count updates", () => {
  it("keeps the category count when the vendor remains under another sub", () => {
    expect(nextDistinctVendorCountAfterUnlink(4, true)).toBe(4);
  });

  it("decrements only when the vendor leaves the category entirely", () => {
    expect(nextDistinctVendorCountAfterUnlink(4, false)).toBe(3);
  });

  it("does not double-count a vendor mapped into a second subcategory", () => {
    expect(nextDistinctVendorCountAfterMap(4, true)).toBe(4);
    expect(nextDistinctVendorCountAfterMap(3, false)).toBe(4);
  });
});
