import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { serializeVendor, vendorInputSchema } from "@/lib/vendor-schema";
import { createVendorWithRelations } from "@/lib/vendor-persist";
import {
  deleteDummyVendors,
  syncVendorsFromIsVendorParties,
} from "@/lib/sync-vendors-from-parties";

export async function GET(request: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const active = request.nextUrl.searchParams.get("active");
  const sync = request.nextUrl.searchParams.get("sync");
  const light = request.nextUrl.searchParams.get("light") === "1";
  const limitParam = Number(request.nextUrl.searchParams.get("limit") || "");
  const take =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), 100)
      : light
        ? 40
        : undefined;

  if (sync === "true" || sync === "1") {
    await deleteDummyVendors();
    const result = await syncVendorsFromIsVendorParties();
    if (request.nextUrl.searchParams.get("syncOnly") === "1") {
      return NextResponse.json(result);
    }
  }

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
                ...(light
                  ? []
                  : [
                      {
                        categories: {
                          some: {
                            OR: [
                              {
                                category: {
                                  contains: q,
                                  mode: "insensitive" as const,
                                },
                              },
                              {
                                subcategory: {
                                  contains: q,
                                  mode: "insensitive" as const,
                                },
                              },
                            ],
                          },
                        },
                      },
                      {
                        contacts: {
                          some: {
                            OR: [
                              {
                                name: {
                                  contains: q,
                                  mode: "insensitive" as const,
                                },
                              },
                              {
                                email: {
                                  contains: q,
                                  mode: "insensitive" as const,
                                },
                              },
                              { phone: { contains: q } },
                            ],
                          },
                        },
                      },
                    ]),
              ],
            }
          : {},
      ],
    },
    include: light
      ? {
          // Mapping search only needs names + category counts.
          categories: { select: { id: true, category: true, subcategory: true } },
        }
      : {
          categories: { orderBy: [{ category: "asc" }, { subcategory: "asc" }] },
          contacts: {
            orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
            include: { vendorCategory: true },
          },
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
    ...(take ? { take } : {}),
  });

  return NextResponse.json(
    vendors.map((vendor) => {
      if (light) {
        const lightVendor = vendor as {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
          active: boolean;
          categories: Array<{
            id: string;
            category: string;
            subcategory: string;
          }>;
        };
        return {
          id: lightVendor.id,
          name: lightVendor.name,
          phone: String(lightVendor.phone || ""),
          email: String(lightVendor.email || ""),
          active: lightVendor.active,
          categories: lightVendor.categories.map((row) => ({
            id: row.id,
            category: row.category,
            subcategory: row.subcategory,
            keywords: [],
          })),
          contacts: [],
          declinedOutreaches: [],
          declinedCount: 0,
        };
      }
      const serialized = serializeVendor(
        vendor as Parameters<typeof serializeVendor>[0]
      );
      if (!("outreaches" in vendor)) {
        return {
          ...serialized,
          declinedOutreaches: [],
          declinedCount: 0,
        };
      }
      const declined =
        (
          vendor as {
            outreaches?: Array<{
              id: string;
              rfqId: string;
              repliedAt: Date | null;
              quotedPrice: unknown;
            }>;
          }
        ).outreaches || [];
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

  const vendor = await createVendorWithRelations(parsed.data);
  return NextResponse.json(serializeVendor(vendor), { status: 201 });
}
