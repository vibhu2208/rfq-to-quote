import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  callStatusLabelForTimeline,
  moveContactToLead,
} from "@/lib/telemarketing/move-to-lead";
import { logTelemarketingTimeline } from "@/lib/telemarketing/timeline";
import { TELEMARKETING_CALL_STATUS_LABELS } from "@/lib/telemarketing/constants";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  status: z.enum([
    "CONNECTED",
    "CALL_BACK_REQUESTED",
    "COULDNT_CONNECT",
    "NOT_INTERESTED",
    "MOVE_TO_LEAD",
  ]),
  note: z.string().min(1),
  followUpAt: z.string().datetime().optional().nullable(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { id } = await params;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const contact = await prisma.telemarketingContact.findUnique({ where: { id } });
  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const followUpAt = parsed.data.followUpAt ? new Date(parsed.data.followUpAt) : null;

  const call = await prisma.telemarketingCall.create({
    data: {
      contactId: id,
      status: parsed.data.status,
      note: parsed.data.note,
      followUpAt,
      actorId: session?.user?.id || null,
    },
  });

  await prisma.telemarketingContact.update({
    where: { id },
    data: { callStatus: parsed.data.status },
  });

  const label = TELEMARKETING_CALL_STATUS_LABELS[parsed.data.status];
  await logTelemarketingTimeline({
    contactId: id,
    type: "CALL_LOGGED",
    title: "Call logged",
    body: `Call outcome: ${callStatusLabelForTimeline(parsed.data.status)}`,
    actorId: session?.user?.id,
    meta: { callId: call.id, status: parsed.data.status, note: parsed.data.note },
  });

  let lead: { id: string; leadNumber: string } | null = null;
  if (parsed.data.status === "MOVE_TO_LEAD") {
    const rfq = await moveContactToLead({
      contact,
      actorId: session?.user?.id,
      callNote: parsed.data.note,
    });
    lead = { id: rfq.id, leadNumber: rfq.leadNumber };
  }

  if (followUpAt) {
    await prisma.telemarketingReminder.create({
      data: {
        contactId: id,
        type: "CALL",
        dueAt: followUpAt,
        notes: `Follow-up after call: ${label}`,
        assignedToUserId: contact.assignedToUserId,
        createdById: session?.user?.id || null,
      },
    });
    await logTelemarketingTimeline({
      contactId: id,
      type: "REMINDER_CREATED",
      title: "Follow-up scheduled",
      body: `Call follow-up at ${followUpAt.toISOString()}`,
      actorId: session?.user?.id,
    });
  }

  return NextResponse.json({ call, lead });
}