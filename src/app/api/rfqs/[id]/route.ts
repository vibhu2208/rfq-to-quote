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
  return NextResponse.json(rfq);
}

const patchSchema = z.object({
  status: z.enum(["NEW", "NEEDS_REVIEW", "PARSED", "QUOTED", "CLOSED"]).optional(),
  parsedCategory: z.string().nullable().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().optional(),
  customerPhone: z.string().optional(),
  customerCompany: z.string().optional(),
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

  try {
    const rfq = await prisma.rfq.update({
      where: { id },
      data: parsed.data,
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        quotes: { orderBy: { createdAt: "desc" }, select: { id: true, quoteNumber: true, status: true, grandTotal: true } },
      },
    });
    return NextResponse.json(rfq);
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 400 });
  }
}
