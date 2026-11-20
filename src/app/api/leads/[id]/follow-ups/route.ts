import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  FollowUpClosedError,
  cancelFollowUp,
  completeFollowUp,
  createFollowUp,
  rescheduleFollowUp,
} from "@/lib/leads/follow-ups";
import { validateFutureDateTime } from "@/lib/datetime/future-datetime";

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
  notifyEmail: z.boolean().optional(),
  notifyWhatsapp: z.boolean().optional(),
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
  whatsappBody: z.string().optional(),
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

  const dueAt = new Date(parsed.data.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    return NextResponse.json({ error: "A valid due date is required" }, { status: 400 });
  }
  const futureErr = validateFutureDateTime(dueAt);
  if (futureErr) {
    return NextResponse.json({ error: futureErr }, { status: 400 });
  }

  const result = await createFollowUp({
    rfqId: id,
    type: parsed.data.type,
    dueAt,
    title: parsed.data.title,
    notes: parsed.data.notes,
    assignedToId: parsed.data.assignedToId,
    createdById: session?.user?.id,
    notifyEmail: parsed.data.notifyEmail,
    notifyWhatsapp: parsed.data.notifyWhatsapp,
    emailSubject: parsed.data.emailSubject,
    emailBody: parsed.data.emailBody,
    whatsappBody: parsed.data.whatsappBody,
  });

  return NextResponse.json(result, { status: 201 });
}

const patchSchema = z.object({
  followUpId: z.string().min(1),
  notes: z.string().optional(),
  action: z.enum(["complete", "cancel", "reschedule"]).optional(),
  dueAt: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { id: leadId } = await params;

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.leadFollowUp.findFirst({
    where: { id: parsed.data.followUpId, rfqId: leadId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });
  }

  const action = parsed.data.action ?? "complete";
  if (action === "cancel") {
    const followUp = await cancelFollowUp({
      id: parsed.data.followUpId,
      actorId: session?.user?.id,
    });
    return NextResponse.json(followUp);
  }

  if (action === "reschedule") {
    const due = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
    if (!due || Number.isNaN(due.getTime())) {
      return NextResponse.json({ error: "A valid due date is required" }, { status: 400 });
    }
    const futureErr = validateFutureDateTime(due);
    if (futureErr) {
      return NextResponse.json({ error: futureErr }, { status: 400 });
    }
    try {
      const followUp = await rescheduleFollowUp({
        id: parsed.data.followUpId,
        dueAt: due,
        actorId: session?.user?.id,
      });
      return NextResponse.json(followUp);
    } catch (err) {
      if (err instanceof FollowUpClosedError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      throw err;
    }
  }

  const followUp = await completeFollowUp({
    id: parsed.data.followUpId,
    actorId: session?.user?.id,
    notes: parsed.data.notes,
  });

  return NextResponse.json(followUp);
}
