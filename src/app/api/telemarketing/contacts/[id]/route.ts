import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { logTelemarketingTimeline } from "@/lib/telemarketing/timeline";
import { moveContactToLead } from "@/lib/telemarketing/move-to-lead";
import {
  buildFieldUpdateBody,
  buildStatusChangeBody,
  buildTagsUpdateBody,
  normalizeTagsInput,
  parseTagsJson,
  type ContactFieldKey,
} from "@/lib/telemarketing/contact-update";
import { validateEmailInput, validatePhoneInput } from "@/lib/telemarketing/validation";
import {
  formatFollowUpTimelineBody,
  reminderNotesForCallback,
  validateFutureDateTime,
} from "@/lib/telemarketing/datetime";

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
          callStatus: true,
          assignedToUserId: true,
          createdAt: true,
          assignedTo: { select: { id: true, name: true, email: true } },
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

  const tags = parseTagsJson(contact.tags as unknown);

  return NextResponse.json({ contact: { ...contact, tags } });
}

const patchSchema = z.object({
  name: z.string().optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  tags: z.array(z.string()).optional(),
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
  note: z.string().min(1).max(2000).optional(),
  callbackDueAt: z.string().datetime().optional(),
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

  if (parsed.data.note) {
    await logTelemarketingTimeline({
      contactId: id,
      type: "NOTE",
      title: "Note",
      body: parsed.data.note.trim(),
      actorId: session?.user?.id,
    });
    return NextResponse.json({ ok: true });
  }

  if (parsed.data.moveToLead) {
    const rfq = await moveContactToLead({
      contact: existing,
      actorId: session?.user?.id,
    });
    return NextResponse.json({ contactId: id, leadId: rfq.id, leadNumber: rfq.leadNumber });
  }

  const actorId = session?.user?.id;
  const data: Record<string, unknown> = {};
  const fieldKeys: ContactFieldKey[] = ["name", "company", "role", "phone", "email"];

  for (const key of fieldKeys) {
    if (parsed.data[key] === undefined) continue;
    if (key === "phone") {
      const v = validatePhoneInput(parsed.data.phone!);
      if (!v.ok) {
        return NextResponse.json({ error: v.error }, { status: 400 });
      }
      data.phone = v.value;
      if (v.value !== existing.phone) {
        await logTelemarketingTimeline({
          contactId: id,
          type: "CONTACT_UPDATED",
          title: "Contact updated",
          body: buildFieldUpdateBody("phone", existing.phone, v.value),
          actorId,
        });
      }
      continue;
    }
    if (key === "email") {
      const v = validateEmailInput(parsed.data.email!);
      if (!v.ok) {
        return NextResponse.json({ error: v.error }, { status: 400 });
      }
      data.email = v.value;
      if (v.value !== existing.email) {
        await logTelemarketingTimeline({
          contactId: id,
          type: "CONTACT_UPDATED",
          title: "Contact updated",
          body: buildFieldUpdateBody("email", existing.email, v.value),
          actorId,
        });
      }
      continue;
    }
    const next = parsed.data[key]!.trim();
    const prev = existing[key].trim();
    if (next !== prev) {
      data[key] = next;
      await logTelemarketingTimeline({
        contactId: id,
        type: "CONTACT_UPDATED",
        title: "Contact updated",
        body: buildFieldUpdateBody(key, existing[key], next),
        actorId,
      });
    }
  }

  if (parsed.data.tags) {
    const before = parseTagsJson(existing.tags as unknown);
    const after = normalizeTagsInput(parsed.data.tags);
    const changed =
      before.length !== after.length || before.some((t, i) => t !== after[i]);
    if (changed) {
      data.tags = after;
      await logTelemarketingTimeline({
        contactId: id,
        type: "CONTACT_UPDATED",
        title: "Contact updated",
        body: buildTagsUpdateBody(before, after),
        actorId,
      });
    }
  }

  if (parsed.data.assignedToUserId !== undefined) {
    const next = parsed.data.assignedToUserId;
    if (next !== existing.assignedToUserId) {
      data.assignedToUserId = next;
      await logTelemarketingTimeline({
        contactId: id,
        type: "CONTACT_ASSIGNED",
        title: "Assignment updated",
        body: next ? "Contact assigned" : "Unassigned",
        actorId,
      });
    }
  }

  if (parsed.data.callStatus !== undefined && parsed.data.callStatus !== existing.callStatus) {
    const nextStatus = parsed.data.callStatus;
    if (nextStatus === "CALL_BACK_REQUESTED") {
      if (!parsed.data.callbackDueAt) {
        return NextResponse.json(
          { error: "Callback date and time is required for Call Back Requested" },
          { status: 400 }
        );
      }
      const dueAt = new Date(parsed.data.callbackDueAt);
      const dueErr = validateFutureDateTime(dueAt);
      if (dueErr) {
        return NextResponse.json({ error: dueErr }, { status: 400 });
      }
    }
    if (nextStatus === "MOVE_TO_LEAD") {
      const rfq = await moveContactToLead({
        contact: existing,
        actorId,
      });
      return NextResponse.json({
        contactId: id,
        leadId: rfq.id,
        leadNumber: rfq.leadNumber,
      });
    }
    data.callStatus = nextStatus;
    await logTelemarketingTimeline({
      contactId: id,
      type: "STATUS_CHANGED",
      title: "Status changed",
      body: buildStatusChangeBody(existing.callStatus, nextStatus),
      actorId,
    });

    if (nextStatus === "CALL_BACK_REQUESTED" && parsed.data.callbackDueAt) {
      const dueAt = new Date(parsed.data.callbackDueAt);
      await prisma.telemarketingReminder.create({
        data: {
          contactId: id,
          type: "CALL",
          dueAt,
          notes: reminderNotesForCallback(),
          assignedToUserId: existing.assignedToUserId,
          createdById: actorId || null,
        },
      });
      await logTelemarketingTimeline({
        contactId: id,
        type: "REMINDER_CREATED",
        title: "Callback scheduled",
        body: formatFollowUpTimelineBody(dueAt),
        actorId,
      });
    }
  }

  if (parsed.data.archive === true) {
    data.archivedAt = new Date();
    await logTelemarketingTimeline({
      contactId: id,
      type: "ARCHIVED",
      title: "Archived",
      body: "Contact archived",
      actorId,
    });
  }
  if (parsed.data.archive === false) {
    data.archivedAt = null;
  }

  const contact =
    Object.keys(data).length > 0
      ? await prisma.telemarketingContact.update({
          where: { id },
          data,
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
          },
        })
      : await prisma.telemarketingContact.findUnique({
          where: { id },
          include: {
            assignedTo: { select: { id: true, name: true, email: true } },
          },
        });

  const tags = parseTagsJson(contact?.tags as unknown);
  return NextResponse.json({ contact: contact ? { ...contact, tags } : null });
}