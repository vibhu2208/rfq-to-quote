import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const rfq = await prisma.rfq.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      quotes: { orderBy: { createdAt: "desc" }, select: { id: true, quoteNumber: true, status: true, grandTotal: true } },
    },
  });
  if (!rfq) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // productSelections may exist in DB before Prisma client is regenerated
  const rows = await prisma.$queryRaw<Array<{ productSelections: unknown }>>`
    SELECT "productSelections" FROM "Rfq" WHERE id = ${id}
  `;
  return NextResponse.json({
    ...rfq,
    productSelections: rows[0]?.productSelections ?? null,
  });
}

const productSnapshotSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().optional().default(""),
  unit: z.string().optional().default("pcs"),
  offerPrice: z.number(),
  taxRate: z.number().optional().default(18),
});

const productSelectionsSchema = z.object({
  lineSelection: z.record(z.string(), z.string()).optional().default({}),
  selectedIds: z.array(z.string()).optional().default([]),
  extras: z
    .array(
      z.object({
        lineNumber: z.number().int().positive().optional(),
        product: productSnapshotSchema,
      })
    )
    .optional()
    .default([]),
});

const patchSchema = z.object({
  status: z.enum(["NEW", "NEEDS_REVIEW", "PARSED", "QUOTED", "CLOSED"]).optional(),
  parsedCategory: z.string().nullable().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().optional(),
  customerPhone: z.string().optional(),
  customerCompany: z.string().optional(),
  productSelections: productSelectionsSchema.nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { productSelections, ...rest } = parsed.data;

  try {
    if (Object.keys(rest).length > 0) {
      await prisma.rfq.update({
        where: { id },
        data: rest,
      });
    }

    if (productSelections !== undefined) {
      if (productSelections === null) {
        await prisma.$executeRaw`
          UPDATE "Rfq" SET "productSelections" = NULL, "updatedAt" = NOW() WHERE id = ${id}
        `;
      } else {
        await prisma.$executeRaw`
          UPDATE "Rfq"
          SET "productSelections" = ${JSON.stringify(productSelections)}::jsonb,
              "updatedAt" = NOW()
          WHERE id = ${id}
        `;
      }
    }

    const rfq = await prisma.rfq.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        quotes: { orderBy: { createdAt: "desc" }, select: { id: true, quoteNumber: true, status: true, grandTotal: true } },
      },
    });
    if (!rfq) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const rows = await prisma.$queryRaw<Array<{ productSelections: unknown }>>`
      SELECT "productSelections" FROM "Rfq" WHERE id = ${id}
    `;

    return NextResponse.json({
      ...rfq,
      productSelections: rows[0]?.productSelections ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 400 });
  }
}
