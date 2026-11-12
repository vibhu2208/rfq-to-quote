/** One vendor↔category mapping row (subcategory may be empty = category-only). */
export type VendorMappingRef = {
  category?: string | null;
  subcategory?: string | null;
};

/** Category-only maps use an empty subcategory cell ("—"), not a real subcategory. */
export function isCategoryOnlyMapping(
  mapping: Pick<VendorMappingRef, "subcategory">
): boolean {
  return !String(mapping.subcategory || "").trim();
}

/** Unique non-empty categories (not mapping-row count). */
export function countVendorMappingCategories(
  mappings: VendorMappingRef[] | null | undefined
): number {
  const categories = new Set<string>();
  for (const row of mappings || []) {
    const category = String(row.category || "").trim();
    if (category) categories.add(category);
  }
  return categories.size;
}

/** Named subcategories only — category-only rows are excluded. */
export function countVendorMappingSubcategories(
  mappings: VendorMappingRef[] | null | undefined
): number {
  let count = 0;
  for (const row of mappings || []) {
    if (!isCategoryOnlyMapping(row)) count += 1;
  }
  return count;
}
