import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { decimalToNumber } from "@/lib/quotes";

const productSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  unit: z.string().optional().default("pcs"),
  basePrice: z.coerce.number().nonnegative(),
  offerPrice: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().nonnegative().optional().default(18),
  taxCategory: z.string().optional().default("GST18"),
  active: z.boolean().optional().default(true),
});

function serializeProduct(p: {
  id: string;
  code: string;
  name: string;
  description: string;
  unit: string;
  basePrice: unknown;
  offerPrice: unknown;
  taxRate: unknown;
  taxCategory: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...p,
    basePrice: decimalToNumber(p.basePrice),
    offerPrice: decimalToNumber(p.offerPrice),
    taxRate: decimalToNumber(p.taxRate),
  };
}

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const activeParam = searchParams.get("active");
  const take = Math.min(Number(searchParams.get("take") || 100), 500);

  const products = await prisma.product.findMany({
    where: {
      AND: [
        activeParam === "true" ? { active: true } : activeParam === "false" ? { active: false } : {},
        q
          ? {
              OR: [
                { code: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    take,
  });

  return NextResponse.json(products.map(serializeProduct));
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
    const product = await prisma.product.create({ data: parsed.data });
    return NextResponse.json(serializeProduct(product), { status: 201 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to create product";
    if (message.includes("Unique constraint")) {
      return NextResponse.json({ error: "Product code already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
