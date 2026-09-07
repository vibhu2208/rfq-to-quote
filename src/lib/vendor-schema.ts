import { z } from "zod";
import { PRODUCT_CATEGORIES } from "@/lib/categories";

export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export const vendorCategorySchema = z.object({
  category: z.string().min(1, "Category is required"),
  subcategory: z.string().optional().default(""),
  keywords: z.array(z.string()).optional().default([]),
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
  })
  .superRefine((vendor, context) => {
    if (!vendor.phone && !vendor.email) {
      context.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Phone or email is required",
      });
    }
    if (vendor.preferredChannel === "WHATSAPP" && !E164_PATTERN.test(vendor.phone)) {
      context.addIssue({
        code: "custom",
        path: ["phone"],
        message: "WhatsApp vendors require E.164 phone format, e.g. +919876543210",
      });
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

export function serializeVendor<T extends {
  categories: Array<{ keywords: unknown }>;
  productHistory?: Array<{ lastPrice: unknown }>;
}>(vendor: T) {
  return {
    ...vendor,
    phone: "phone" in vendor ? String(vendor.phone || "") : "",
    email: "email" in vendor ? String(vendor.email || "") : "",
    whatsappId: "whatsappId" in vendor ? String(vendor.whatsappId || "") : "",
    categories: vendor.categories.map((category) => ({
      ...category,
      keywords: normalizeKeywords(category.keywords),
    })),
    productHistory: vendor.productHistory?.map((history) => ({
      ...history,
      lastPrice: Number(history.lastPrice),
    })),
  };
}
