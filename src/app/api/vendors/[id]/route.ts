import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { serializeVendor, vendorInputSchema } from "@/lib/vendor-schema";
import { replaceVendorWithRelations } from "@/lib/vendor-persist";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: {
      categories: { orderBy: [{ category: "asc" }, { subcategory: "asc" }] },
      contacts: {
        orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
        include: { vendorCategory: true },
      },
      productHistory: { orderBy: { lastQuotedAt: "desc" } },
    },
  });
  if (!vendor) {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }
  return NextResponse.json(serializeVendor(vendor));
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const parsed = vendorInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const vendor = await replaceVendorWithRelations(id, parsed.data);
    return NextResponse.json(serializeVendor(vendor));
  } catch {
    return NextResponse.json({ error: "Vendor update failed" }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const vendor = await prisma.vendor.update({
    where: { id },
    data: { active: false },
    include: {
      categories: true,
      contacts: { include: { vendorCategory: true } },
      productHistory: true,
    },
  });
  return NextResponse.json(serializeVendor(vendor));
}
