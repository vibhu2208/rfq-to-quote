import { prisma } from "@/lib/prisma";
import {
  normalizeVendorCategory,
  resolveVendorCategoryId,
  type VendorInput,
} from "@/lib/vendor-schema";

const vendorInclude = {
  categories: { orderBy: [{ category: "asc" as const }, { subcategory: "asc" as const }] },
  contacts: {
    orderBy: [{ isPrimary: "desc" as const }, { name: "asc" as const }],
    include: { vendorCategory: true },
  },
  productHistory: { orderBy: { lastQuotedAt: "desc" as const } },
};

function contactRows(
  contacts: VendorInput["contacts"],
  categories: Array<{ id: string; category: string; subcategory: string }>
) {
  return contacts
    .filter((contact) => contact.name || contact.email || contact.phone)
    .map((contact, index) => ({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      role: contact.role,
      isPrimary: contact.isPrimary || index === 0,
      vendorCategoryId: resolveVendorCategoryId(contact, categories),
    }));
}

export async function createVendorWithRelations(data: VendorInput) {
  return prisma.$transaction(async (tx) => {
    const vendor = await tx.vendor.create({
      data: {
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        whatsappId: data.whatsappId || null,
        preferredChannel: data.preferredChannel,
        active: data.active,
        categories: {
          create: data.categories.map((category) => ({
            category: normalizeVendorCategory(category.category),
            subcategory: String(category.subcategory || "").trim(),
            keywords: category.keywords,
          })),
        },
      },
      include: { categories: true },
    });

    const contacts = contactRows(data.contacts, vendor.categories);
    if (contacts.length > 0) {
      await tx.vendorContact.createMany({
        data: contacts.map((contact) => ({
          vendorId: vendor.id,
          ...contact,
        })),
      });
    }

    return tx.vendor.findUniqueOrThrow({
      where: { id: vendor.id },
      include: vendorInclude,
    });
  });
}

export async function replaceVendorWithRelations(id: string, data: VendorInput) {
  return prisma.$transaction(async (tx) => {
    await tx.vendorContact.deleteMany({ where: { vendorId: id } });
    await tx.vendorCategory.deleteMany({ where: { vendorId: id } });

    const vendor = await tx.vendor.update({
      where: { id },
      data: {
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        whatsappId: data.whatsappId || null,
        preferredChannel: data.preferredChannel,
        active: data.active,
        categories: {
          create: data.categories.map((category) => ({
            category: normalizeVendorCategory(category.category),
            subcategory: String(category.subcategory || "").trim(),
            keywords: category.keywords,
          })),
        },
      },
      include: { categories: true },
    });

    const contacts = contactRows(data.contacts, vendor.categories);
    if (contacts.length > 0) {
      await tx.vendorContact.createMany({
        data: contacts.map((contact) => ({
          vendorId: vendor.id,
          ...contact,
        })),
      });
    }

    return tx.vendor.findUniqueOrThrow({
      where: { id: vendor.id },
      include: vendorInclude,
    });
  });
}

export { vendorInclude };
