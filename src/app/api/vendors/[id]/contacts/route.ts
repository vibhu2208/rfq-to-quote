import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import {
  normalizeVendorCategory,
  resolveVendorCategoryId,
  vendorContactSchema,
} from "@/lib/vendor-schema";

type Params = { params: Promise<{ id: string }> };

const createBodySchema = vendorContactSchema
  .extend({
    name: z.string().trim().optional().default(""),
    email: z.union([z.string().trim().email(), z.literal("")]).optional().default(""),
    phone: z.string().trim().optional().default(""),
    role: z.string().trim().optional().default(""),
    isPrimary: z.boolean().optional().default(false),
  })
  .superRefine((contact, context) => {
    if (!contact.name?.trim() && !contact.email?.trim() && !contact.phone?.trim()) {
      context.addIssue({
        code: "custom",
        message: "Name, email, or phone is required",
        path: ["name"],
      });
    }
  });

/** Add a POC to a vendor (saved for future Recore sends). */
export async function POST(request: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id: vendorId } = await params;
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, active: true, _count: { select: { contacts: true } } },
  });
  if (!vendor || !vendor.active) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }

  const json = await request.json().catch(() => null);
  const parsed = createBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const makePrimary = data.isPrimary || vendor._count.contacts === 0;

  const categories = await prisma.vendorCategory.findMany({
    where: { vendorId },
    select: { id: true, category: true, subcategory: true },
  });

  let vendorCategoryId = resolveVendorCategoryId(data, categories);
  if (
    !vendorCategoryId &&
    (data.category?.trim() || data.vendorCategoryId)
  ) {
    const category = normalizeVendorCategory(String(data.category || "").trim());
    const subcategory = String(data.subcategory || "").trim();
    if (category) {
      const row = await prisma.vendorCategory.upsert({
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
          keywords: [],
        },
        update: {},
      });
      vendorCategoryId = row.id;
    }
  }

  const contact = await prisma.$transaction(async (tx) => {
    if (makePrimary) {
      await tx.vendorContact.updateMany({
        where: { vendorId },
        data: { isPrimary: false },
      });
    }
    return tx.vendorContact.create({
      data: {
        vendorId,
        name: data.name.trim(),
        email: data.email.trim(),
        phone: data.phone.trim(),
        role: data.role.trim(),
        isPrimary: makePrimary,
        vendorCategoryId,
      },
      include: { vendorCategory: true },
    });
  });

  return NextResponse.json({
    id: contact.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    role: contact.role,
    isPrimary: contact.isPrimary,
    vendorCategoryId: contact.vendorCategoryId,
    category: contact.vendorCategory?.category || "",
    subcategory: contact.vendorCategory?.subcategory || "",
  });
}
