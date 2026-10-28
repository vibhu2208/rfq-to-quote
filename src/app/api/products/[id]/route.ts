import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { decimalToNumber } from "@/lib/quotes";
import { syncProductToInventory } from "@/lib/accounting/inventory";

const productSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  unit: z.string().optional(),
  basePrice: z.coerce.number().nonnegative().optional(),
  offerPrice: z.coerce.number().nonnegative().optional(),
  lastPrice: z.coerce.number().nonnegative().optional(),
  taxRate: z.coerce.number().nonnegative().optional(),
  taxCategory: z.string().optional(),
  productType: z.enum(["GOODS", "SERVICE"]).optional(),
  active: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

function serializeProduct<T extends {
  basePrice: unknown;
  offerPrice: unknown;
  lastPrice?: unknown;
  lastPricedAt?: Date | null;
  taxRate: unknown;
  mrp: unknown;
  openingStock: unknown;
}>(product: T) {
  return {
    ...product,
    basePrice: decimalToNumber(product.basePrice),
    offerPrice: decimalToNumber(product.offerPrice),
    lastPrice: product.lastPrice == null ? null : decimalToNumber(product.lastPrice),
    lastPricedAt: product.lastPricedAt ?? null,
    taxRate: decimalToNumber(product.taxRate),
    mrp: product.mrp == null ? null : decimalToNumber(product.mrp),
    openingStock: decimalToNumber(product.openingStock),
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(serializeProduct(product));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { lastPrice, ...rest } = parsed.data;
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...rest,
        ...(lastPrice != null
          ? { lastPrice, lastPricedAt: new Date(), offerPrice: lastPrice }
          : {}),
      },
    });

    if (product.active && product.productType === "GOODS") {
      await syncProductToInventory({
        productId: product.id,
        productType: product.productType,
      });
    }

    return NextResponse.json(serializeProduct(product));
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const product = await prisma.product.update({
    where: { id },
    data: { active: false },
  });
  return NextResponse.json(serializeProduct(product));
}
