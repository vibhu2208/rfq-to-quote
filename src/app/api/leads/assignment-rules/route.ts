import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { upsertAssignmentRule } from "@/lib/leads/assignment";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const items = await prisma.leadAssignmentRule.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ items });
}

const schema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  type: z.enum(["ROUND_ROBIN", "CATEGORY", "GEOGRAPHY", "WORKLOAD"]),
  active: z.boolean().optional(),
  priority: z.number().int().optional(),
  organisationId: z.string().nullable().optional(),
  config: z
    .object({
      userIds: z.array(z.string()).optional(),
      categoryKeywords: z.array(z.string()).optional(),
      states: z.array(z.string()).optional(),
      cities: z.array(z.string()).optional(),
      lastIndex: z.number().optional(),
    })
    .optional()
    .default({}),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const item = await upsertAssignmentRule({
    ...parsed.data,
    createdById: session?.user?.id,
  });

  return NextResponse.json(item, { status: parsed.data.id ? 200 : 201 });
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.leadAssignmentRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
