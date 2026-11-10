import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { session, error } = await requireSession();
  if (error) return error;
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await prisma.savedLeadView.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({ items });
}

const createSchema = z.object({
  name: z.string().min(1),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
  columns: z.array(z.string()).optional().default([]),
  isDefault: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.isDefault) {
    await prisma.savedLeadView.updateMany({
      where: { userId: session.user.id, isDefault: true },
      data: { isDefault: false },
    });
  }

  const item = await prisma.savedLeadView.create({
    data: {
      userId: session.user.id,
      name: parsed.data.name,
      filters: parsed.data.filters as Prisma.InputJsonValue,
      columns: parsed.data.columns as Prisma.InputJsonValue,
      isDefault: parsed.data.isDefault,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
