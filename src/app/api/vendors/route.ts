import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { serializeVendor, vendorInputSchema } from "@/lib/vendor-schema";

export async function GET(request: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const active = request.nextUrl.searchParams.get("active");
  const vendors = await prisma.vendor.findMany({
    where: {
      AND: [
        active === "true"
          ? { active: true }
          : active === "false"
            ? { active: false }
            : {},
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
                {
                  categories: {
                    some: {
                      OR: [
                        { category: { contains: q, mode: "insensitive" } },
                        { subcategory: { contains: q, mode: "insensitive" } },
                      ],
                    },
                  },
                },
              ],
            }
          : {},
      ],
    },
    include: {
      categories: { orderBy: [{ category: "asc" }, { subcategory: "asc" }] },
      productHistory: { orderBy: { lastQuotedAt: "desc" }, take: 1 },
      outreaches: {
        where: { status: "DECLINED" },
        orderBy: { repliedAt: "desc" },
        take: 3,
        select: {
          id: true,
          rfqId: true,
          status: true,
          replyIntent: true,
          repliedAt: true,
          quotedPrice: true,
        },
      },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return NextResponse.json(
    vendors.map((vendor) => {
      const serialized = serializeVendor(vendor);
      const declined = vendor.outreaches || [];
      return {
        ...serialized,
        declinedOutreaches: declined.map((row) => ({
          id: row.id,
          rfqId: row.rfqId,
          repliedAt: row.repliedAt?.toISOString() || null,
          quotedPrice: row.quotedPrice ? Number(row.quotedPrice) : null,
        })),
        declinedCount: declined.length,
      };
    })
  );
}

export async function POST(request: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const parsed = vendorInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const vendor = await prisma.vendor.create({
    data: {
      name: data.name,
      phone: data.phone || null,
      email: data.email || null,
      whatsappId: data.whatsappId || null,
      preferredChannel: data.preferredChannel,
      active: data.active,
      categories: {
        create: data.categories.map((category) => ({
          category: category.category,
          subcategory: category.subcategory,
          keywords: category.keywords,
        })),
      },
    },
    include: { categories: true, productHistory: true },
  });

  return NextResponse.json(serializeVendor(vendor), { status: 201 });
}
