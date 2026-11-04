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

export async function getAdminTaxonomy(): Promise<TaxonomyCategory[]> {
  const [productRows, vendorCategories, adminSubcategories] = await Promise.all([
    prisma.product.groupBy({
      by: ["category", "subCategory"],
      where: {
        active: true,
        category: { not: null },
        subCategory: { not: null },
      },
    }),
    prisma.vendorCategory.findMany({
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
      orderBy: [{ category: "asc" }, { subcategory: "asc" }],
    }),
    prisma.adminSubcategory.findMany({
      select: { category: true, subcategory: true },
      orderBy: [{ category: "asc" }, { subcategory: "asc" }],
    }),
  ]);

  const catalogByCategory = new Map<string, Set<string>>();
  for (const row of productRows) {
    const category = normalizeVendorCategory(String(row.category || "").trim());
    const subcategory = normalizeSubcategory(row.subCategory);
    if (!category || !subcategory) continue;
    if (!catalogByCategory.has(category)) catalogByCategory.set(category, new Set());
    catalogByCategory.get(category)!.add(subcategory);
  }

  const adminByCategory = new Map<string, Set<string>>();
  for (const row of adminSubcategories) {
    const category = normalizeVendorCategory(row.category);
    const subcategory = normalizeSubcategory(row.subcategory);
    if (!category || !subcategory) continue;
    if (!adminByCategory.has(category)) adminByCategory.set(category, new Set());
    adminByCategory.get(category)!.add(subcategory);
  }

  const mappedByCategory = new Map<string, Map<string, TaxonomyVendor[]>>();

  for (const row of vendorCategories) {
    const category = normalizeVendorCategory(row.category);
    const subcategory = normalizeSubcategory(row.subcategory);
    if (!mappedByCategory.has(category)) mappedByCategory.set(category, new Map());
    const bySub = mappedByCategory.get(category)!;
    if (!bySub.has(subcategory)) bySub.set(subcategory, []);
    bySub.get(subcategory)!.push({
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
    });
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
    const mappedSubs = mappedByCategory.get(category) || new Map<string, TaxonomyVendor[]>();
    const subcategoryNames = [
      ...new Set([...catalogSubs, ...adminSubs, ...mappedSubs.keys()]),
    ].sort((a, b) => {
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b);
    });

    const subcategories: TaxonomySubcategory[] = subcategoryNames.map((subcategory) => {
      const vendors = mappedSubs.get(subcategory) || [];
      return {
        subcategory,
        fromCatalog: catalogSubs.has(subcategory),
        fromAdmin: adminSubs.has(subcategory),
        vendorCount: vendors.length,
        vendors,
      };
    });

    const vendorIds = new Set(
      subcategories.flatMap((row) => row.vendors.map((vendor) => vendor.vendorId))
    );

    return {
      category,
      subcategoryCount: subcategories.length,
      vendorCount: vendorIds.size,
      subcategories,
    };
  });
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

  const [deletedMaps, deletedAdmin] = await Promise.all([
    prisma.vendorCategory.deleteMany({
      where: { category, subcategory },
    }),
    prisma.adminSubcategory.deleteMany({
      where: { category, subcategory },
    }),
  ]);

  return {
    deleted: deletedMaps.count,
    deletedAdmin: deletedAdmin.count,
    category,
    subcategory,
  };
}
