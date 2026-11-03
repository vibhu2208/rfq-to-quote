import { z } from "zod";
import { PRODUCT_CATEGORIES } from "@/lib/categories";

export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export const vendorCategorySchema = z.object({
  category: z.string().min(1, "Category is required"),
  subcategory: z.string().optional().default(""),
  keywords: z.array(z.string()).optional().default([]),
});

export const vendorContactSchema = z.object({
  name: z.string().trim().optional().default(""),
  email: z.union([z.string().trim().email(), z.literal("")]).optional().default(""),
  phone: z.string().trim().optional().default(""),
  role: z.string().trim().optional().default(""),
  isPrimary: z.boolean().optional().default(false),
});

export const vendorInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    phone: z.string().trim().optional().default(""),
    email: z.union([z.string().trim().email(), z.literal("")]).optional().default(""),
    whatsappId: z.string().trim().optional().default(""),
    preferredChannel: z.enum(["EMAIL", "WHATSAPP"]).default("EMAIL"),
    active: z.boolean().optional().default(true),
    categories: z.array(vendorCategorySchema).min(1, "At least one category is required"),
    contacts: z.array(vendorContactSchema).optional().default([]),
  })
  .superRefine((vendor, context) => {
    const hasContactEmail = vendor.contacts.some((contact) => contact.email);
    const hasContactPhone = vendor.contacts.some((contact) => contact.phone);
    if (!vendor.phone && !vendor.email && !hasContactEmail && !hasContactPhone) {
      context.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Phone, email, or a POC contact is required",
      });
    }
    if (vendor.preferredChannel === "WHATSAPP") {
      const waNumber = (vendor.whatsappId || vendor.phone || "").trim();
      const contactWa = vendor.contacts.some(
        (contact) => contact.phone && E164_PATTERN.test(contact.phone)
      );
      if (!contactWa && !E164_PATTERN.test(waNumber)) {
        context.addIssue({
          code: "custom",
          path: vendor.whatsappId ? ["whatsappId"] : ["phone"],
          message:
            "WhatsApp vendors need a number in E.164 format, e.g. +919876543210 (phone, WhatsApp number, or POC phone)",
        });
      }
    }
  });

export type VendorInput = z.infer<typeof vendorInputSchema>;

export function normalizeKeywords(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value.map(String)
    : String(value || "").split(/[|,;]/);

  return [
    ...new Set(
      values
        .map((keyword) => keyword.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export function normalizeVendorCategory(category: string): string {
  const trimmed = category.trim();
  const exact = PRODUCT_CATEGORIES.find(
    (candidate) => candidate.toLowerCase() === trimmed.toLowerCase()
  );
  return exact || trimmed;
}

export type VendorContactInput = z.infer<typeof vendorContactSchema>;

export function serializeVendorContacts(
  contacts: Array<{
    id?: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    isPrimary?: boolean;
  }> | undefined,
  fallback?: { name?: string; email?: string | null; phone?: string | null }
) {
  const rows = (contacts || []).map((contact) => ({
    id: contact.id,
    name: String(contact.name || "").trim(),
    email: String(contact.email || "").trim(),
    phone: String(contact.phone || "").trim(),
    role: String(contact.role || "").trim(),
    isPrimary: Boolean(contact.isPrimary),
  }));
  if (rows.length > 0) return rows;
  const email = String(fallback?.email || "").trim();
  const phone = String(fallback?.phone || "").trim();
  if (!email && !phone) return [];
  return [
    {
      name: String(fallback?.name || "").trim() || "Primary",
      email,
      phone,
      role: "",
      isPrimary: true,
    },
  ];
}

export function serializeVendor<T extends {
  name?: string;
  phone?: string | null;
  email?: string | null;
  whatsappId?: string | null;
  categories: Array<{ keywords: unknown }>;
  contacts?: Array<{
    id?: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
    isPrimary?: boolean;
  }>;
  productHistory?: Array<{ lastPrice: unknown }>;
}>(vendor: T) {
  return {
    ...vendor,
    phone: String(vendor.phone || ""),
    email: String(vendor.email || ""),
    whatsappId: String(vendor.whatsappId || ""),
    categories: vendor.categories.map((category) => ({
      ...category,
      keywords: normalizeKeywords(category.keywords),
    })),
    contacts: serializeVendorContacts(vendor.contacts, {
      name: vendor.name,
      email: vendor.email,
      phone: vendor.phone,
    }),
    productHistory: vendor.productHistory?.map((history) => ({
      ...history,
      lastPrice: Number(history.lastPrice),
    })),
  };
}
