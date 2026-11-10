import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { completeFollowUp, createFollowUp } from "@/lib/leads/follow-ups";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await params;

  const items = await prisma.leadFollowUp.findMany({
    where: { rfqId: id },
    orderBy: { dueAt: "asc" },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ items });
}

const createSchema = z.object({
  type: z.enum(["CALL", "EMAIL", "MEETING", "TASK"]).optional(),
  dueAt: z.string().min(1),
  title: z.string().optional(),
  notes: z.string().optional(),
  assignedToId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { id } = await params;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const followUp = await createFollowUp({
    rfqId: id,
    type: parsed.data.type,
    dueAt: new Date(parsed.data.dueAt),
    title: parsed.data.title,
    notes: parsed.data.notes,
    assignedToId: parsed.data.assignedToId,
    createdById: session?.user?.id,
  });

  return NextResponse.json(followUp, { status: 201 });
}

const completeSchema = z.object({
  followUpId: z.string().min(1),
  notes: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;
  await params;

  const body = await req.json();
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const followUp = await completeFollowUp({
    id: parsed.data.followUpId,
    actorId: session?.user?.id,
    notes: parsed.data.notes,
  });

  return NextResponse.json(followUp);
}
