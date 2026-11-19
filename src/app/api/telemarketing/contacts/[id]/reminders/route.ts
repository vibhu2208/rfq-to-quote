import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { logTelemarketingTimeline } from "@/lib/telemarketing/timeline";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await params;

  const reminders = await prisma.telemarketingReminder.findMany({
    where: { contactId: id },
    orderBy: { dueAt: "asc" },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ items: reminders });
}

const createSchema = z.object({
  type: z.enum(["CALL", "WHATSAPP", "MEETING", "CUSTOM"]),
  dueAt: z.string().datetime(),
  notes: z.string().min(1),
  assignedToUserId: z.string().nullable().optional(),
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

  const contact = await prisma.telemarketingContact.findUnique({ where: { id } });
  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const reminder = await prisma.telemarketingReminder.create({
    data: {
      contactId: id,
      type: parsed.data.type,
      dueAt: new Date(parsed.data.dueAt),
      notes: parsed.data.notes,
      assignedToUserId:
        parsed.data.assignedToUserId ?? contact.assignedToUserId ?? null,
      createdById: session?.user?.id || null,
    },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  await logTelemarketingTimeline({
    contactId: id,
    type: "REMINDER_CREATED",
    title: "Reminder created",
    body: parsed.data.notes,
    actorId: session?.user?.id,
    meta: { reminderId: reminder.id, type: parsed.data.type },
  });

  return NextResponse.json({ reminder });
}