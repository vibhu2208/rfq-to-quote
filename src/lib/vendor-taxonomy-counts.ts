import { normalizeVendorCategory } from "@/lib/vendor-schema";

/** Mapping row used to decide if a vendor still belongs under a category. */
export type VendorCategoryMapRef = {
  category?: string | null;
  subcategory?: string | null;
};

function sameCategory(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeVendorCategory(String(left || "").trim());
  const b = normalizeVendorCategory(String(right || "").trim());
  return Boolean(a) && a === b;
}

function sameSubcategory(left: string | null | undefined, right: string | null | undefined) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

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
    if (!sameCategory(row.category, cat)) return false;
    if (excludeSet && sameSubcategory(row.subcategory, exclude)) return false;
    return true;
  });
}

/** Subcategory names still stored for this vendor under `category`. */
export function remainingCategorySubcategories(
  mappings: VendorCategoryMapRef[] | null | undefined,
  category: string
): string[] {
  const cat = String(category || "").trim();
  if (!cat) return [];
  return (mappings || [])
    .filter((row) => sameCategory(row.category, cat))
    .map((row) => String(row.subcategory || "").trim());
}

export type UnlinkSubcategoryState = {
  subcategory: string;
  vendorCount: number;
  /** Loaded vendor ids. Empty means the id list was not loaded. */
  vendorIds: string[];
};

/**
 * Distinct vendors in a category after one subcategory unlink.
 * `vendorRemainingSubcategories` is null when the vendor payload is unknown.
 * Unloaded subcategory id lists must not be treated as "vendor left".
 */
export function categoryVendorCountAfterUnlink(input: {
  currentCount: number;
  subcategories: UnlinkSubcategoryState[];
  unlinkedVendorId: string;
  unlinkedSubcategory: string;
  vendorRemainingSubcategories: string[] | null;
}): number {
  const current = Number.isFinite(input.currentCount) ? input.currentCount : 0;
  if (
    input.vendorRemainingSubcategories &&
    input.vendorRemainingSubcategories.length > 0
  ) {
    return Math.max(0, current);
  }

  const others = input.subcategories.filter(
    (sub) => !sameSubcategory(sub.subcategory, input.unlinkedSubcategory)
  );
  const stillListed = others.some((sub) =>
    sub.vendorIds.includes(input.unlinkedVendorId)
  );
  if (stillListed) return Math.max(0, current);

  if (input.vendorRemainingSubcategories) {
    return Math.max(0, current - 1);
  }

  const othersFullyLoaded =
    others.length > 0 &&
    others.every(
      (sub) => sub.vendorCount <= 0 || sub.vendorIds.length >= sub.vendorCount
    );
  if (othersFullyLoaded) return Math.max(0, current - 1);
  return Math.max(0, current);
}

/**
 * Drop one vendor from a subcategory count.
 * A short in-session id list is not the full roster, so the count falls by one
 * instead of becoming the length of that partial list.
 */
export function subcategoryVendorCountAfterUnlink(input: {
  vendorCount: number;
  vendorIds: string[];
  unlinkedVendorId: string;
}): { vendorCount: number; vendorIds: string[] } {
  const vendorIds = input.vendorIds.filter((id) => id !== input.unlinkedVendorId);
  const base = Number.isFinite(input.vendorCount) ? input.vendorCount : 0;
  return {
    vendorIds,
    vendorCount: Math.max(0, base - 1, vendorIds.length),
  };
}

type TaxonomyUnlinkCategory<Vendor extends { vendorId: string }> = {
  category: string;
  subcategoryCount: number;
  vendorCount: number;
  subcategories: Array<{
    subcategory: string;
    vendorCount: number;
    vendors: Vendor[];
  }>;
};

/** Apply one unlink to the in-memory taxonomy tree without under-counting. */
export function applyTaxonomyUnlink<
  Vendor extends { vendorId: string },
  Category extends TaxonomyUnlinkCategory<Vendor>,
>(
  categories: Category[],
  input: {
    category: string;
    subcategory: string;
    vendorId: string;
    vendorRemainingSubcategories: string[] | null;
  }
): Category[] {
  return categories.map((row) => {
    if (!sameCategory(row.category, input.category)) return row;
    const subcategories = row.subcategories.map((sub) => {
      if (!sameSubcategory(sub.subcategory, input.subcategory)) return sub;
      const next = subcategoryVendorCountAfterUnlink({
        vendorCount: sub.vendorCount,
        vendorIds: sub.vendors.map((vendor) => vendor.vendorId),
        unlinkedVendorId: input.vendorId,
      });
      return {
        ...sub,
        vendors: sub.vendors.filter((vendor) => vendor.vendorId !== input.vendorId),
        vendorCount: next.vendorCount,
      };
    });
    const named = subcategories.filter((sub) =>
      String(sub.subcategory || "").trim()
    ).length;
    return {
      ...row,
      subcategories,
      subcategoryCount: named,
      vendorCount: categoryVendorCountAfterUnlink({
        currentCount: row.vendorCount,
        subcategories: row.subcategories.map((sub) => ({
          subcategory: sub.subcategory,
          vendorCount: sub.vendorCount,
          vendorIds: sub.vendors.map((vendor) => vendor.vendorId),
        })),
        unlinkedVendorId: input.vendorId,
        unlinkedSubcategory: input.subcategory,
        vendorRemainingSubcategories: input.vendorRemainingSubcategories,
      }),
    };
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
