import { prisma } from "@/lib/prisma";
import {
  normalizeKeywords,
  normalizeVendorCategory,
  serializeVendor,
} from "@/lib/vendor-schema";

export type VendorMapContactInput = {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  isPrimary?: boolean;
};

export type VendorMapInput = {
  vendorId?: string;
  vendor?: {
    name: string;
    phone?: string;
    email?: string;
    whatsappId?: string;
    preferredChannel?: "EMAIL" | "WHATSAPP";
  };
  category: string;
  subcategory?: string;
  keywords?: string[];
  /** Preferred: multiple department POCs for this subcategory. */
  contacts?: VendorMapContactInput[];
  /** Legacy single contact — merged into contacts when provided. */
  contact?: VendorMapContactInput;
};

function normalizeContactRows(
  contacts: VendorMapContactInput[] | undefined,
  contact: VendorMapContactInput | undefined
) {
  const rows = [...(contacts || []), ...(contact ? [contact] : [])]
    .map((row) => ({
      name: String(row.name || "").trim(),
      email: String(row.email || "").trim(),
      phone: String(row.phone || "").trim(),
      role: String(row.role || "").trim(),
      isPrimary: Boolean(row.isPrimary),
    }))
    .filter((row) => row.name || row.email || row.phone);

  if (rows.length === 0) return [];
  const primaryIndex = rows.findIndex((row) => row.isPrimary);
  return rows.map((row, index) => ({
    ...row,
    isPrimary: primaryIndex >= 0 ? index === primaryIndex : index === 0,
    role: row.role || "Category POC",
  }));
}

export async function mapVendorToCategory(input: VendorMapInput) {
  const category = normalizeVendorCategory(input.category.trim());
  const subcategory = String(input.subcategory || "").trim();
  const keywords = normalizeKeywords(input.keywords || []);
  const contactRows = normalizeContactRows(input.contacts, input.contact);

  if (!category) throw new Error("Category is required");

  // Prefetch outside the write txn so pooler latency doesn't burn the timeout.
  let vendorId = input.vendorId?.trim() || "";
  if (vendorId) {
    const existing = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true },
    });
    if (!existing) throw new Error("Vendor not found");
  }

  const { vendorCategoryId } = await prisma.$transaction(
    async (tx) => {
      if (!vendorId) {
        const name = String(input.vendor?.name || "").trim();
        if (!name) throw new Error("Vendor name or vendorId is required");
        const created = await tx.vendor.create({
          data: {
            name,
            phone: input.vendor?.phone?.trim() || null,
            email: input.vendor?.email?.trim() || null,
            whatsappId: input.vendor?.whatsappId?.trim() || null,
            preferredChannel: input.vendor?.preferredChannel || "EMAIL",
            active: true,
          },
        });
        vendorId = created.id;
      }

      const vendorCategory = await tx.vendorCategory.upsert({
        where: {
          vendorId_category_subcategory: {
            vendorId,
            category,
            subcategory,
          },
        },
        create: {
          vendorId,
          category,
          subcategory,
          keywords,
        },
        // Always persist keywords so callers can clear them with [].
        update: { keywords },
      });

      if (contactRows.length > 0) {
        await tx.vendorContact.deleteMany({
          where: { vendorId, vendorCategoryId: vendorCategory.id },
        });

        await tx.vendorContact.createMany({
          data: contactRows.map((row) => ({
            vendorId,
            vendorCategoryId: vendorCategory.id,
            name: row.name,
            email: row.email,
            phone: row.phone,
            role: row.role,
            isPrimary: row.isPrimary,
          })),
        });
      }

      return { vendorCategoryId: vendorCategory.id };
    },
    { maxWait: 10_000, timeout: 20_000 }
  );

  const [scopedContacts, vendor] = await Promise.all([
    prisma.vendorContact.findMany({
      where: { vendorId, vendorCategoryId },
      orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isPrimary: true,
      },
    }),
    prisma.vendor.findUniqueOrThrow({
      where: { id: vendorId },
      include: {
        categories: {
          orderBy: [{ category: "asc" }, { subcategory: "asc" }],
        },
        contacts: {
          orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
          include: { vendorCategory: true },
        },
      },
    }),
  ]);

  return {
    vendor: serializeVendor(vendor),
    vendorCategoryId,
    category,
    subcategory,
    contactCount: scopedContacts.length,
    mapping: {
      vendorId,
      vendorName: vendor.name,
      vendorCategoryId,
      active: vendor.active,
      phone: vendor.phone || "",
      email: vendor.email || "",
      contacts: scopedContacts,
    },
  };
}

export async function unlinkVendorFromCategory(input: {
  vendorId: string;
  category: string;
  subcategory?: string;
}) {
  const category = normalizeVendorCategory(input.category.trim());
  const subcategory = String(input.subcategory || "").trim();
  if (!input.vendorId || !category) {
    throw new Error("vendorId and category are required");
  }

  const row = await prisma.vendorCategory.findUnique({
    where: {
      vendorId_category_subcategory: {
        vendorId: input.vendorId,
        category,
        subcategory,
      },
    },
  });

  if (!row) {
    return { deleted: false, vendorId: input.vendorId, category, subcategory };
  }

  await prisma.$transaction(async (tx) => {
    // Explicit cleanup so scoped POCs never become company-level orphans
    // even if the DB FK is still ON DELETE SET NULL.
    await tx.vendorContact.deleteMany({
      where: { vendorCategoryId: row.id },
    });
    await tx.vendorCategory.delete({ where: { id: row.id } });
  });
  return { deleted: true, vendorId: input.vendorId, category, subcategory };
}
