/** Mapping row used to decide if a vendor still belongs under a category. */
export type VendorCategoryMapRef = {
  category?: string | null;
  subcategory?: string | null;
};

/**
 * True when the vendor still has at least one mapping under `category`.
 * Pass `excludeSubcategory` when using pre-unlink local maps so the row being
 * removed is ignored.
 */
export function vendorHasCategoryMapping(
  mappings: VendorCategoryMapRef[] | null | undefined,
  category: string,
  options?: { excludeSubcategory?: string }
): boolean {
  const cat = String(category || "").trim();
  if (!cat) return false;
  const exclude = options?.excludeSubcategory;
  const excludeSet = exclude !== undefined;
  return (mappings || []).some((row) => {
    if (String(row.category || "").trim() !== cat) return false;
    if (
      excludeSet &&
      String(row.subcategory || "") === String(exclude || "")
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Category vendor counts are distinct vendors across subcategories.
 * Only decrement when the unlinked vendor no longer has any map under the category.
 */
export function nextDistinctVendorCountAfterUnlink(
  currentCount: number,
  vendorRemainsInCategory: boolean
): number {
  const current = Number.isFinite(currentCount) ? currentCount : 0;
  if (vendorRemainsInCategory) return Math.max(0, current);
  return Math.max(0, current - 1);
}

/**
 * Only increment the category distinct count when this vendor is new to the
 * category (not merely newly mapped under another subcategory).
 */
export function nextDistinctVendorCountAfterMap(
  currentCount: number,
  vendorAlreadyInCategory: boolean
): number {
  const current = Number.isFinite(currentCount) ? currentCount : 0;
  if (vendorAlreadyInCategory) return Math.max(0, current);
  return Math.max(0, current + 1);
}
