import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { decimalToNumber } from "@/lib/quotes";
import { getDefaultOrgContext } from "@/lib/accounting/context";
import { syncProductToInventory } from "@/lib/accounting/inventory";
import { rankProductsByQuery, searchTokens } from "@/lib/product-search";

const productSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  unit: z.string().optional().default("pcs"),
  basePrice: z.coerce.number().nonnegative(),
  offerPrice: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().nonnegative().optional().default(18),
  taxCategory: z.string().optional().default("GST18"),
  productType: z.enum(["GOODS", "SERVICE"]).optional().default("GOODS"),
  active: z.boolean().optional().default(true),
  openingQty: z.coerce.number().nonnegative().optional(),
  openingUnitCost: z.coerce.number().nonnegative().optional(),
});

function serializeProduct(p: {
  id: string;
  code: string;
  name: string;
  description: string;
  unit: string;
  productType?: string;
  sourceProductId?: string | null;
  category?: string | null;
  subCategory?: string | null;
  brand?: string | null;
  hsnCode?: string | null;
  gstTaxName?: string | null;
  modelNo?: string | null;
  partNo?: string | null;
  basePrice: unknown;
  offerPrice: unknown;
  lastPrice?: unknown;
  lastPricedAt?: Date | null;
  taxRate: unknown;
  taxCategory: string;
  mrp?: unknown;
  openingStock?: unknown;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    unit: p.unit,
    productType: p.productType,
    sourceProductId: p.sourceProductId ?? null,
    category: p.category ?? null,
    subCategory: p.subCategory ?? null,
    brand: p.brand ?? null,
    hsnCode: p.hsnCode ?? null,
    gstTaxName: p.gstTaxName ?? null,
    modelNo: p.modelNo ?? null,
    partNo: p.partNo ?? null,
    taxCategory: p.taxCategory,
    active: p.active,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    basePrice: decimalToNumber(p.basePrice),
    offerPrice: decimalToNumber(p.offerPrice),
    lastPrice: p.lastPrice == null ? null : decimalToNumber(p.lastPrice),
    lastPricedAt: p.lastPricedAt ?? null,
    taxRate: decimalToNumber(p.taxRate),
    mrp: p.mrp == null ? null : decimalToNumber(p.mrp),
    openingStock: p.openingStock == null ? 0 : decimalToNumber(p.openingStock),
  };
}

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const activeParam = searchParams.get("active");
  const take = Math.min(Number(searchParams.get("take") || 100), 2000);
  const tokens = searchTokens(q);

  // Multi-word queries: every token must match somewhere on code/name/description
  // (so "dell 16gb" finds "Dell Latitude 16GB RAM", not only contiguous substrings).
  const tokenFilters =
    tokens.length > 0
      ? tokens.map((token) => ({
          OR: [
            { code: { contains: token, mode: "insensitive" as const } },
            { sourceProductId: { contains: token, mode: "insensitive" as const } },
            { name: { contains: token, mode: "insensitive" as const } },
            { description: { contains: token, mode: "insensitive" as const } },
            { category: { contains: token, mode: "insensitive" as const } },
            { brand: { contains: token, mode: "insensitive" as const } },
            { modelNo: { contains: token, mode: "insensitive" as const } },
            { hsnCode: { contains: token, mode: "insensitive" as const } },
          ],
        }))
      : [];

  // Pull a wider pool when searching so relevance ranking can surface the best name hits
  // instead of the first N alphabetically.
  const fetchTake = q ? Math.min(Math.max(take * 5, 50), 2000) : take;

  const products = await prisma.product.findMany({
    where: {
      AND: [
        activeParam === "true" ? { active: true } : activeParam === "false" ? { active: false } : {},
        ...tokenFilters,
      ],
    },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      unit: true,
      productType: true,
      sourceProductId: true,
      category: true,
      subCategory: true,
      brand: true,
      hsnCode: true,
      gstTaxName: true,
      modelNo: true,
      partNo: true,
      taxCategory: true,
      basePrice: true,
      offerPrice: true,
      lastPrice: true,
      lastPricedAt: true,
      taxRate: true,
      mrp: true,
      openingStock: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    take: fetchTake,
  });

  const ranked = q ? rankProductsByQuery(products, q).slice(0, take) : products;

  return NextResponse.json(ranked.map(serializeProduct));
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const ctx = await getDefaultOrgContext();
    const { openingQty, openingUnitCost, ...data } = parsed.data;

    const product = await prisma.product.create({
      data: {
        ...data,
        organisationId: ctx.organisationId,
      },
    });

    await syncProductToInventory({
      productId: product.id,
      productType: product.productType,
      openingQty,
      unitCost: openingUnitCost ?? decimalToNumber(product.basePrice),
      warehouseId: ctx.warehouseId,
      gstRegistrationId: ctx.gstRegistrationId,
    });

    return NextResponse.json(serializeProduct(product), { status: 201 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to create product";
    if (message.includes("Unique constraint")) {
      return NextResponse.json({ error: "Product code already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
