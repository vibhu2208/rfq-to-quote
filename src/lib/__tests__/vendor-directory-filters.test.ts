import { describe, expect, it } from "vitest";
import { vendorDirectoryFilters } from "@/lib/vendor-directory-filters";

describe("vendor directory filters", () => {
  it("adds mapped and missing-POC constraints only when asked", () => {
    expect(vendorDirectoryFilters({ mapped: null, poc: null })).toEqual([]);
    expect(vendorDirectoryFilters({ mapped: "yes", poc: "no" })).toEqual([
      { categories: { some: {} } },
      { contacts: { none: {} } },
    ]);
    expect(vendorDirectoryFilters({ mapped: "no", poc: "yes" })).toEqual([
      { categories: { none: {} } },
      { contacts: { some: {} } },
    ]);
  });
});
