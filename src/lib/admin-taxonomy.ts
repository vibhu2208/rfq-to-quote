import { prisma } from "@/lib/prisma";
import { PRODUCT_CATEGORIES } from "@/lib/categories";
import { normalizeVendorCategory } from "@/lib/vendor-schema";

export type TaxonomyContact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isPrimary: boolean;
};

export type TaxonomyVendor = {
  vendorId: string;
  vendorName: string;
  vendorCategoryId: string;
  active: boolean;
  phone: string;
  email: string;
  contacts: TaxonomyContact[];
};

export type TaxonomySubcategory = {
  subcategory: string;
  fromCatalog: boolean;
  fromAdmin: boolean;
  vendorCount: number;
  /** Populated only by subcategory detail endpoint / optimistic local updates. */
  vendors: TaxonomyVendor[];
};

export type TaxonomyCategory = {
  category: string;
  subcategoryCount: number;
  vendorCount: number;
  subcategories: TaxonomySubcategory[];
};

function normalizeSubcategory(value: string | null | undefined) {
  return String(value || "").trim();
}

/**
 * Light taxonomy tree for the admin mapping UI.
 * Avoids joining every vendor contact on initial load (was multi-second on remote DB).
 */
export async function getAdminTaxonomy(): Promise<TaxonomyCategory[]> {
  const [productRows, vendorCategoryRows, adminSubcategories] =
    await Promise.all([
      prisma.product.findMany({
        where: {
          active: true,
          category: { not: null },
          subCategory: { not: null },
        },
        distinct: ["category", "subCategory"],
        select: { category: true, subCategory: true },
      }),
      prisma.vendorCategory.findMany({
        select: {
          category: true,
          subcategory: true,
          vendorId: true,
        },
      }),
      prisma.adminSubcategory.findMany({
        select: { category: true, subcategory: true },
      }),
    ]);

  const catalogByCategory = new Map<string, Set<string>>();
  for (const row of productRows) {
    const category = normalizeVendorCategory(String(row.category || "").trim());
    const subcategory = normalizeSubcategory(row.subCategory);
    if (!category || !subcategory) continue;
    if (!catalogByCategory.has(category)) {
      catalogByCategory.set(category, new Set());
    }
    catalogByCategory.get(category)!.add(subcategory);
  }

  const adminByCategory = new Map<string, Set<string>>();
  for (const row of adminSubcategories) {
    const category = normalizeVendorCategory(row.category);
    const subcategory = normalizeSubcategory(row.subcategory);
    if (!category || !subcategory) continue;
    if (!adminByCategory.has(category)) {
      adminByCategory.set(category, new Set());
    }
    adminByCategory.get(category)!.add(subcategory);
  }

  const mappedByCategory = new Map<
    string,
    Map<string, Set<string>>
  >();
  for (const row of vendorCategoryRows) {
    const category = normalizeVendorCategory(row.category);
    const subcategory = normalizeSubcategory(row.subcategory);
    if (!mappedByCategory.has(category)) {
      mappedByCategory.set(category, new Map());
    }
    const bySub = mappedByCategory.get(category)!;
    if (!bySub.has(subcategory)) bySub.set(subcategory, new Set());
    bySub.get(subcategory)!.add(row.vendorId);
  }

  const categoryNames = [
    ...new Set([
      ...PRODUCT_CATEGORIES,
      ...catalogByCategory.keys(),
      ...adminByCategory.keys(),
      ...mappedByCategory.keys(),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  return categoryNames.map((category) => {
    const catalogSubs = catalogByCategory.get(category) || new Set<string>();
    const adminSubs = adminByCategory.get(category) || new Set<string>();
    const mappedSubs =
      mappedByCategory.get(category) || new Map<string, Set<string>>();
    const subcategoryNames = [
      ...new Set([...catalogSubs, ...adminSubs, ...mappedSubs.keys()]),
    ].sort((a, b) => {
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b);
    });

    const categoryVendorIds = new Set<string>();
    const subcategories: TaxonomySubcategory[] = subcategoryNames.map(
      (subcategory) => {
        const vendorIds = mappedSubs.get(subcategory) || new Set<string>();
        for (const id of vendorIds) categoryVendorIds.add(id);
        return {
          subcategory,
          fromCatalog: catalogSubs.has(subcategory),
          fromAdmin: adminSubs.has(subcategory),
          vendorCount: vendorIds.size,
          vendors: [],
        };
      }
    );

    return {
      category,
      subcategoryCount: subcategories.length,
      vendorCount: categoryVendorIds.size,
      subcategories,
    };
  });
}

/** Vendors + POCs for one category/subcategory pair (loaded on demand). */
export async function getTaxonomySubcategoryVendors(input: {
  category: string;
  subcategory?: string;
}): Promise<TaxonomyVendor[]> {
  const category = normalizeVendorCategory(input.category.trim());
  const subcategory = normalizeSubcategory(input.subcategory);
  if (!category) return [];

  const rows = await prisma.vendorCategory.findMany({
    where: { category, subcategory },
    include: {
      vendor: {
        select: {
          id: true,
          name: true,
          active: true,
          phone: true,
          email: true,
        },
      },
      contacts: {
        orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isPrimary: true,
        },
      },
    },
    orderBy: { vendor: { name: "asc" } },
  });

  return rows.map((row) => ({
    vendorId: row.vendor.id,
    vendorName: row.vendor.name,
    vendorCategoryId: row.id,
    active: row.vendor.active,
    phone: row.vendor.phone || "",
    email: row.vendor.email || "",
    contacts: row.contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      role: contact.role,
      isPrimary: contact.isPrimary,
    })),
  }));
}

export async function addTaxonomySubcategory(input: {
  category: string;
  subcategory: string;
}) {
  const category = normalizeVendorCategory(input.category.trim());
  const subcategory = normalizeSubcategory(input.subcategory);
  if (!category) throw new Error("Category is required");
  if (!subcategory) throw new Error("Subcategory is required");

  const row = await prisma.adminSubcategory.upsert({
    where: {
      category_subcategory: { category, subcategory },
    },
    create: { category, subcategory },
    update: {},
  });

  return {
    id: row.id,
    category: row.category,
    subcategory: row.subcategory,
  };
}

export async function removeTaxonomySubcategory(input: {
  category: string;
  subcategory: string;
}) {
  const category = normalizeVendorCategory(input.category.trim());
  const subcategory = normalizeSubcategory(input.subcategory);
  if (!category) {
    throw new Error("Category is required");
  }

  const maps = await prisma.vendorCategory.findMany({
    where: { category, subcategory },
    select: { id: true },
  });
  const mapIds = maps.map((row) => row.id);

  const [deletedContacts, deletedMaps, deletedAdmin] =
    await prisma.$transaction([
      prisma.vendorContact.deleteMany({
        where: { vendorCategoryId: { in: mapIds } },
      }),
      prisma.vendorCategory.deleteMany({
        where: { category, subcategory },
      }),
      prisma.adminSubcategory.deleteMany({
        where: { category, subcategory },
      }),
    ]);

  return {
    deleted: deletedMaps.count,
    deletedContacts: deletedContacts.count,
    deletedAdmin: deletedAdmin.count,
    category,
    subcategory,
  };
}
