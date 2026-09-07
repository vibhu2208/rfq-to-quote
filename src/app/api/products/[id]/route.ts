import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { decimalToNumber } from "@/lib/quotes";

const productSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  unit: z.string().optional(),
  basePrice: z.coerce.number().nonnegative().optional(),
  offerPrice: z.coerce.number().nonnegative().optional(),
  taxRate: z.coerce.number().nonnegative().optional(),
  taxCategory: z.string().optional(),
  active: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...product,
    basePrice: decimalToNumber(product.basePrice),
    offerPrice: decimalToNumber(product.offerPrice),
    taxRate: decimalToNumber(product.taxRate),
  });
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
    const product = await prisma.product.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json({
      ...product,
      basePrice: decimalToNumber(product.basePrice),
      offerPrice: decimalToNumber(product.offerPrice),
      taxRate: decimalToNumber(product.taxRate),
    });
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  // Soft deactivate
  const product = await prisma.product.update({
    where: { id },
    data: { active: false },
  });
  return NextResponse.json({
    ...product,
    basePrice: decimalToNumber(product.basePrice),
    offerPrice: decimalToNumber(product.offerPrice),
    taxRate: decimalToNumber(product.taxRate),
  });
}
