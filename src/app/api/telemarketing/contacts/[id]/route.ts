import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { logTelemarketingTimeline } from "@/lib/telemarketing/timeline";
import { moveContactToLead } from "@/lib/telemarketing/move-to-lead";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await params;

  const contact = await prisma.telemarketingContact.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      calls: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actor: { select: { id: true, name: true, email: true } } },
      },
      reminders: {
        orderBy: { dueAt: "asc" },
        take: 50,
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
        },
      },
      timeline: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { actor: { select: { id: true, name: true, email: true } } },
      },
      alternatives: {
        select: {
          id: true,
          name: true,
          role: true,
          phone: true,
          email: true,
          company: true,
        },
      },
      convertedLead: {
        select: {
          id: true,
          leadNumber: true,
          leadStage: true,
          customerName: true,
          customerCompany: true,
          quotes: {
            select: {
              id: true,
              quoteNumber: true,
              status: true,
              grandTotal: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      },
    },
  });

  if (!contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ contact });
}

const patchSchema = z.object({
  name: z.string().optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  assignedToUserId: z.string().nullable().optional(),
  callStatus: z
    .enum([
      "NO_ACTION",
      "CONNECTED",
      "CALL_BACK_REQUESTED",
      "COULDNT_CONNECT",
      "NOT_INTERESTED",
      "MOVE_TO_LEAD",
    ])
    .optional(),
  archive: z.boolean().optional(),
  moveToLead: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { id } = await params;

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.telemarketingContact.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (parsed.data.moveToLead) {
    const rfq = await moveContactToLead({
      contact: existing,
      actorId: session?.user?.id,
    });
    return NextResponse.json({ contactId: id, leadId: rfq.id, leadNumber: rfq.leadNumber });
  }

  const data: Record<string, unknown> = {};
  for (const key of ["name", "company", "role", "phone", "email", "callStatus"] as const) {
    if (parsed.data[key] !== undefined) data[key] = parsed.data[key];
  }
  if (parsed.data.assignedToUserId !== undefined) {
    data.assignedToUserId = parsed.data.assignedToUserId;
  }
  if (parsed.data.archive === true) {
    data.archivedAt = new Date();
  }
  if (parsed.data.archive === false) {
    data.archivedAt = null;
  }

  const contact = await prisma.telemarketingContact.update({
    where: { id },
    data,
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  if (parsed.data.assignedToUserId !== undefined) {
    await logTelemarketingTimeline({
      contactId: id,
      type: "CONTACT_ASSIGNED",
      title: "Assignment updated",
      body: parsed.data.assignedToUserId ? "Contact assigned" : "Unassigned",
      actorId: session?.user?.id,
    });
  }
  if (parsed.data.archive === true) {
    await logTelemarketingTimeline({
      contactId: id,
      type: "ARCHIVED",
      title: "Archived",
      body: "Contact archived",
      actorId: session?.user?.id,
    });
  }

  return NextResponse.json({ contact });
}