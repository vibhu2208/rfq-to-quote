import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { serializeVendor, vendorInputSchema } from "@/lib/vendor-schema";
import { createVendorWithRelations } from "@/lib/vendor-persist";
import {
  deleteDummyVendors,
  syncVendorsFromIsVendorParties,
} from "@/lib/sync-vendors-from-parties";
import type { Prisma } from "@prisma/client";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value || "");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function vendorSearchWhere(
  q: string,
  active: string | null,
  includeRelationSearch: boolean
): Prisma.VendorWhereInput {
  return {
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
              ...(includeRelationSearch
                ? [
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
                  ]
                : []),
            ],
          }
        : {},
    ],
  };
}

function serializeLightVendor(vendor: {
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
}) {
  return {
    id: vendor.id,
    name: vendor.name,
    phone: String(vendor.phone || ""),
    email: String(vendor.email || ""),
    active: vendor.active,
    categories: vendor.categories.map((row) => ({
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

function serializeListVendor(vendor: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  whatsappId: string | null;
  preferredChannel: "EMAIL" | "WHATSAPP";
  active: boolean;
  categories: Array<{
    id: string;
    category: string;
    subcategory: string;
  }>;
  contacts: Array<{
    id: string;
    name: string;
    email: string;
    phone: string;
    isPrimary: boolean;
    vendorCategoryId: string | null;
  }>;
  _count: { outreaches: number };
}) {
  return {
    id: vendor.id,
    name: vendor.name,
    phone: String(vendor.phone || ""),
    email: String(vendor.email || ""),
    whatsappId: String(vendor.whatsappId || ""),
    preferredChannel: vendor.preferredChannel,
    active: vendor.active,
    categories: vendor.categories.map((row) => ({
      id: row.id,
      category: row.category,
      subcategory: row.subcategory,
      keywords: [] as string[],
    })),
    contacts: vendor.contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      isPrimary: contact.isPrimary,
      vendorCategoryId: contact.vendorCategoryId,
    })),
    declinedOutreaches: [] as unknown[],
    declinedCount: vendor._count.outreaches,
  };
}

function serializeFullVendor(vendor: Parameters<typeof serializeVendor>[0] & {
  outreaches?: Array<{
    id: string;
    rfqId: string;
    repliedAt: Date | null;
    quotedPrice: unknown;
  }>;
}) {
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
}

export async function GET(request: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  const active = request.nextUrl.searchParams.get("active");
  const sync = request.nextUrl.searchParams.get("sync");
  const light = request.nextUrl.searchParams.get("light") === "1";
  const list = request.nextUrl.searchParams.get("list") === "1";
  const pageParam = request.nextUrl.searchParams.get("page");
  const paged = pageParam != null && pageParam !== "";
  const page = paged ? parsePositiveInt(pageParam, 1) : 1;
  const pageSize = Math.min(
    parsePositiveInt(
      request.nextUrl.searchParams.get("pageSize"),
      DEFAULT_PAGE_SIZE
    ),
    MAX_PAGE_SIZE
  );
  const limitParam = Number(request.nextUrl.searchParams.get("limit") || "");
  // Always bound list responses. Bare GET /api/vendors previously returned the
  // full directory (~3k rows / multi-MB decoded); keep a hard ceiling.
  const take =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), MAX_PAGE_SIZE)
      : light
        ? 40
        : list || paged
          ? undefined
          : DEFAULT_PAGE_SIZE;

  if (sync === "true" || sync === "1") {
    await deleteDummyVendors();
    const result = await syncVendorsFromIsVendorParties();
    if (request.nextUrl.searchParams.get("syncOnly") === "1") {
      return NextResponse.json(result);
    }
  }

  const where = vendorSearchWhere(q, active, !light);
  const orderBy: Prisma.VendorOrderByWithRelationInput[] = [
    { active: "desc" },
    { name: "asc" },
  ];

  if (list || paged) {
    const skip = paged ? (page - 1) * pageSize : 0;
    const takeRows = paged ? pageSize : take || DEFAULT_PAGE_SIZE;
    const [total, vendors] = await Promise.all([
      paged ? prisma.vendor.count({ where }) : Promise.resolve(0),
      prisma.vendor.findMany({
        where,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          whatsappId: true,
          preferredChannel: true,
          active: true,
          categories: {
            select: { id: true, category: true, subcategory: true },
            orderBy: [{ category: "asc" }, { subcategory: "asc" }],
          },
          contacts: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              isPrimary: true,
              vendorCategoryId: true,
            },
            orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
          },
          _count: {
            select: {
              outreaches: { where: { status: "DECLINED" } },
            },
          },
        },
        orderBy,
        skip,
        take: takeRows,
      }),
    ]);

    const items = vendors.map(serializeListVendor);
    if (paged) {
      return NextResponse.json({
        items,
        total,
        page,
        pageSize,
      });
    }
    return NextResponse.json(items);
  }

  if (light) {
    const vendors = await prisma.vendor.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        active: true,
        categories: {
          select: { id: true, category: true, subcategory: true },
        },
      },
      orderBy,
      ...(take ? { take } : {}),
    });
    return NextResponse.json(vendors.map(serializeLightVendor));
  }

  const vendors = await prisma.vendor.findMany({
    where,
    include: {
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
    orderBy,
    ...(take ? { take } : {}),
  });

  return NextResponse.json(
    vendors.map((vendor) =>
      serializeFullVendor(
        vendor as Parameters<typeof serializeFullVendor>[0]
      )
    )
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
