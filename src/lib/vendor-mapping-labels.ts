export const PRIMARY_POC_TITLE =
  "Primary point of contact for this company or department. It is not a preferred vendor.";

export const COVERAGE_TOTALS_TITLE =
  "Categories are taxonomy buckets. Named subcategories exclude category-only maps. Vendor links count each vendor–subcategory row; a vendor in two subcategories counts twice. Category-level links are maps with no subcategory, mostly Misc.";

export function taxonomySourceLabel(source: "catalog" | "admin" | "mapped"): {
  label: string;
  title: string;
} {
  if (source === "catalog") {
    return {
      label: "Catalog",
      title: "This subcategory comes from a product in the catalog.",
    };
  }
  if (source === "admin") {
    return {
      label: "Admin",
      title:
        "This subcategory was created in vendor mapping. It is not a catalog product subcategory.",
    };
  }
  return {
    label: "Mapped",
    title:
      "Vendors are linked here. The subcategory was not added from the catalog or as an admin label.",
  };
}

export function assignMappingSaveLabel(input: {
  saving?: boolean;
  selectedSubcategories: number;
  categoryLevelSelected: boolean;
  unlinking: number;
}): string {
  if (input.saving) return "Saving…";
  const adding =
    input.selectedSubcategories + (input.categoryLevelSelected ? 1 : 0);
  const removing = input.unlinking;
  if (adding === 0 && removing > 0) {
    return removing === 1 ? "Remove mapping" : `Remove ${removing} mappings`;
  }
  if (adding > 1 && removing === 0) return `Save ${adding} mappings`;
  if (adding > 0 && removing > 0) return "Save changes";
  return "Save mapping";
}

export function assignMappingHelp(input: {
  selectedSubcategories: number;
  categoryLevelSelected: boolean;
  unlinking: number;
  categoryHasNamedSubs: boolean;
}): string {
  const adding =
    input.selectedSubcategories + (input.categoryLevelSelected ? 1 : 0);
  if (!input.categoryHasNamedSubs && adding === 0 && input.unlinking === 0) {
    return "This category has no subcategories. Map the vendor at category level, or add a subcategory first.";
  }
  if (adding === 0 && input.unlinking > 0) {
    return "This removes the vendor from the mappings you unchecked. Other categories stay as they are.";
  }
  return "Save adds or updates the checked subcategories and removes unchecked ones that were already mapped. It does not change other categories.";
}
