import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { QuoteStatus } from "@prisma/client";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.literal("status"),
  status: z.nativeEnum(QuoteStatus),
});

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bulk request" }, { status: 400 });
  }

  const result = await prisma.quote.updateMany({
    where: { id: { in: parsed.data.ids } },
    data: { status: parsed.data.status },
  });

  return NextResponse.json({ updated: result.count });
}