import { normalizeVendorCategory } from "@/lib/vendor-schema";

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
    const category = normalizeVendorCategory(String(row.category || "").trim());
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

/** Heading for one category group on the By vendor table. */
export function vendorMappingGroupLabel(
  mappings: VendorMappingRef[] | null | undefined
): string {
  const named = countVendorMappingSubcategories(mappings);
  const categoryOnly = (mappings || []).some((row) => isCategoryOnlyMapping(row));
  if (named === 0 && categoryOnly) return "Category-level";
  const noun = named === 1 ? "subcategory" : "subcategories";
  if (categoryOnly) return `${named} ${noun} · category-level`;
  return `${named} ${noun}`;
}

export function countNamedSubcategoryRows(
  rows: Array<{ subcategory?: string | null }> | null | undefined
): number {
  return (rows || []).filter((row) => String(row.subcategory || "").trim()).length;
}

export type TaxonomyCoverageRow = {
  category: string;
  subcategories: Array<{ subcategory?: string | null; vendorCount: number }>;
};

export type TaxonomyCoverageSummary = {
  categories: number;
  namedSubcategories: number;
  categoryLevelLinks: number;
  vendorLinks: number;
  categoriesWithNoNamedSubcategory: number;
  categoriesWithNoVendors: number;
  namedSubcategoriesWithNoVendor: number;
};

/** Defined coverage totals for the vendor-mapping header and filters. */
export function summarizeTaxonomyCoverage(
  rows: TaxonomyCoverageRow[] | null | undefined
): TaxonomyCoverageSummary {
  const summary: TaxonomyCoverageSummary = {
    categories: 0,
    namedSubcategories: 0,
    categoryLevelLinks: 0,
    vendorLinks: 0,
    categoriesWithNoNamedSubcategory: 0,
    categoriesWithNoVendors: 0,
    namedSubcategoriesWithNoVendor: 0,
  };
  for (const row of rows || []) {
    summary.categories += 1;
    const subs = row.subcategories || [];
    const named = subs.filter((sub) => String(sub.subcategory || "").trim());
    const level = subs.filter((sub) => !String(sub.subcategory || "").trim());
    if (named.length === 0) summary.categoriesWithNoNamedSubcategory += 1;
    summary.namedSubcategories += named.length;
    summary.namedSubcategoriesWithNoVendor += named.filter(
      (sub) => (sub.vendorCount || 0) <= 0
    ).length;
    const levelLinks = level.reduce((sum, sub) => sum + (sub.vendorCount || 0), 0);
    const links = subs.reduce((sum, sub) => sum + (sub.vendorCount || 0), 0);
    summary.categoryLevelLinks += levelLinks;
    summary.vendorLinks += links;
    if (links <= 0) summary.categoriesWithNoVendors += 1;
  }
  return summary;
}
