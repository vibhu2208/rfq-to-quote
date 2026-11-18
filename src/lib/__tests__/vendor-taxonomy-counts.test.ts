import { describe, expect, it } from "vitest";
import {
  applyTaxonomyUnlink,
  categoryVendorCountAfterUnlink,
  nextDistinctVendorCountAfterMap,
  nextDistinctVendorCountAfterUnlink,
  remainingCategorySubcategories,
  subcategoryVendorCountAfterUnlink,
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

  it("treats legacy category spellings as the same taxonomy bucket", () => {
    expect(
      vendorHasCategoryMapping(
        [{ category: "networking", subcategory: "DLINK" }],
        "NETWORKING"
      )
    ).toBe(true);
    expect(
      remainingCategorySubcategories(
        [
          { category: "networking", subcategory: "DLINK" },
          { category: "Misc", subcategory: "" },
        ],
        "NETWORKING"
      )
    ).toEqual(["DLINK"]);
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

const networkingSubs = [
  { subcategory: "DLINK", vendorCount: 3, vendorIds: [] as string[] },
  { subcategory: "FIBER", vendorCount: 1, vendorIds: [] as string[] },
  { subcategory: "NETGEAR", vendorCount: 1, vendorIds: [] as string[] },
  { subcategory: "CISCO", vendorCount: 1, vendorIds: [] as string[] },
];

describe("category vendor count after unlink", () => {
  it("keeps the distinct count when the vendor still has another subcategory", () => {
    expect(
      categoryVendorCountAfterUnlink({
        currentCount: 4,
        subcategories: networkingSubs,
        unlinkedVendorId: "astek",
        unlinkedSubcategory: "FIBER",
        vendorRemainingSubcategories: ["DLINK", "NETGEAR"],
      })
    ).toBe(4);
    expect(
      categoryVendorCountAfterUnlink({
        currentCount: 4,
        subcategories: networkingSubs,
        unlinkedVendorId: "astek",
        unlinkedSubcategory: "NETGEAR",
        vendorRemainingSubcategories: ["DLINK"],
      })
    ).toBe(4);
  });

  it("does not decrement when other subcategory vendor lists were not loaded", () => {
    expect(
      categoryVendorCountAfterUnlink({
        currentCount: 4,
        subcategories: networkingSubs,
        unlinkedVendorId: "astek",
        unlinkedSubcategory: "FIBER",
        vendorRemainingSubcategories: null,
      })
    ).toBe(4);
  });

  it("decrements only when the vendor has no remaining map in the category", () => {
    expect(
      categoryVendorCountAfterUnlink({
        currentCount: 4,
        subcategories: networkingSubs,
        unlinkedVendorId: "astek",
        unlinkedSubcategory: "DLINK",
        vendorRemainingSubcategories: [],
      })
    ).toBe(3);
  });

  it("does not replace a subcategory count with a partial in-session vendor list", () => {
    expect(
      subcategoryVendorCountAfterUnlink({
        vendorCount: 3,
        vendorIds: ["astek"],
        unlinkedVendorId: "astek",
      })
    ).toEqual({ vendorCount: 2, vendorIds: [] });
  });
});

describe("applyTaxonomyUnlink", () => {
  it("keeps NETWORKING at 4 vendors after unlinking one of Astek's subcategories", () => {
    const next = applyTaxonomyUnlink(
      [
        {
          category: "NETWORKING",
          subcategoryCount: 4,
          vendorCount: 4,
          subcategories: [
            {
              subcategory: "DLINK",
              vendorCount: 3,
              vendors: [] as Array<{ vendorId: string }>,
            },
            {
              subcategory: "FIBER",
              vendorCount: 1,
              vendors: [],
            },
            {
              subcategory: "NETGEAR",
              vendorCount: 1,
              vendors: [],
            },
            {
              subcategory: "CISCO",
              vendorCount: 1,
              vendors: [],
            },
          ],
        },
      ],
      {
        category: "NETWORKING",
        subcategory: "FIBER",
        vendorId: "astek",
        vendorRemainingSubcategories: ["DLINK", "NETGEAR"],
      }
    );
    expect(next[0].vendorCount).toBe(4);
    expect(next[0].subcategories.find((sub) => sub.subcategory === "FIBER")?.vendorCount).toBe(0);
    expect(next[0].subcategories.find((sub) => sub.subcategory === "DLINK")?.vendorCount).toBe(3);
  });
});
