import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import {
  mapVendorToCategory,
  unlinkVendorFromCategory,
} from "@/lib/admin-vendor-maps";

const contactSchema = z.object({
  name: z.string().trim().optional().default(""),
  email: z.union([z.string().trim().email(), z.literal("")]).optional().default(""),
  phone: z.string().trim().optional().default(""),
  role: z.string().trim().optional().default(""),
  isPrimary: z.boolean().optional().default(false),
});

const mapBodySchema = z
  .object({
    vendorId: z.string().trim().optional(),
    vendor: z
      .object({
        name: z.string().trim().min(1),
        phone: z.string().trim().optional().default(""),
        email: z.union([z.string().trim().email(), z.literal("")]).optional().default(""),
        whatsappId: z.string().trim().optional().default(""),
        preferredChannel: z.enum(["EMAIL", "WHATSAPP"]).optional().default("EMAIL"),
      })
      .optional(),
    category: z.string().trim().min(1, "Category is required"),
    subcategory: z.string().trim().optional().default(""),
    keywords: z.array(z.string()).optional().default([]),
    contacts: z.array(contactSchema).optional().default([]),
    contact: contactSchema.optional(),
  })
  .superRefine((body, context) => {
    if (!body.vendorId && !body.vendor?.name) {
      context.addIssue({
        code: "custom",
        path: ["vendorId"],
        message: "Provide vendorId or vendor.name",
      });
    }
  });

const unlinkBodySchema = z.object({
  vendorId: z.string().trim().min(1),
  category: z.string().trim().min(1),
  subcategory: z.string().trim().optional().default(""),
});

/** Link an existing or new vendor to a category/subcategory with optional department POCs. */
export async function POST(request: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const json = await request.json().catch(() => null);
  const parsed = mapBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await mapVendorToCategory(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to map vendor" },
      { status: 400 }
    );
  }
}

/** Unlink a vendor from a category/subcategory mapping. */
export async function DELETE(request: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const json = await request.json().catch(() => null);
  const parsed = unlinkBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await unlinkVendorFromCategory(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to unlink vendor" },
      { status: 400 }
    );
  }
}
