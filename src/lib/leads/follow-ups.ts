import type { FollowUpStatus, FollowUpType } from "@prisma/client";
import { getCompanyConfig } from "@/lib/company";
import { sendGmailEmail } from "@/lib/gmail-smtp";
import { logLeadActivity } from "@/lib/leads/activity";
import { buildReminderCopy } from "@/lib/leads/reminder-copy";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp";

export type FollowUpNotifyChannelResult = {
  sent: boolean;
  to?: string;
  messageId?: string;
  error?: string;
};

export type FollowUpNotifications = {
  email?: FollowUpNotifyChannelResult;
  whatsapp?: FollowUpNotifyChannelResult;
};

export async function createFollowUp(input: {
  rfqId: string;
  type?: FollowUpType;
  dueAt: Date;
  title?: string;
  notes?: string;
  assignedToId?: string | null;
  createdById?: string | null;
  /** Channels to notify the client when the reminder is created. */
  notifyEmail?: boolean;
  notifyWhatsapp?: boolean;
  /** Optional edited outbound copy. Falls back to generated reminder copy. */
  emailSubject?: string;
  emailBody?: string;
  whatsappBody?: string;
}) {
  const notifyChannels = [
    ...(input.notifyEmail ? (["EMAIL"] as const) : []),
    ...(input.notifyWhatsapp ? (["WHATSAPP"] as const) : []),
  ];

  const followUp = await prisma.leadFollowUp.create({
    data: {
      rfqId: input.rfqId,
      type: input.type || "CALL",
      dueAt: input.dueAt,
      title: input.title || "",
      notes: input.notes || "",
      assignedToId: input.assignedToId || null,
      createdById: input.createdById || null,
      status: "PENDING",
    },
  });

  await prisma.rfq.update({
    where: { id: input.rfqId },
    data: { nextFollowUpAt: input.dueAt },
  });

  await logLeadActivity({
    rfqId: input.rfqId,
    type: "FOLLOW_UP_SCHEDULED",
    title: input.title || `Follow-up (${input.type || "CALL"})`,
    body: input.notes || "",
    actorId: input.createdById,
    meta: {
      followUpId: followUp.id,
      dueAt: input.dueAt.toISOString(),
      notifyChannels,
    },
  });

  const notifications: FollowUpNotifications = {};

  if (input.notifyEmail || input.notifyWhatsapp) {
    const rfq = await prisma.rfq.findUnique({
      where: { id: input.rfqId },
      select: {
        leadNumber: true,
        customerName: true,
        customerCompany: true,
        customerEmail: true,
        customerPhone: true,
      },
    });

    const company = getCompanyConfig();
    const generated = buildReminderCopy({
      customerName: rfq?.customerName || rfq?.customerCompany || "",
      leadNumber: rfq?.leadNumber || input.rfqId,
      dueAt: input.dueAt,
      title: input.title || "",
      notes: input.notes || "",
      companyName: company.name,
    });
    const emailSubject =
      (input.emailSubject || "").trim() || generated.subject;
    const emailBody = (input.emailBody || "").trim() || generated.text;
    const whatsappBody =
      (input.whatsappBody || "").trim() || generated.text;

    if (input.notifyEmail) {
      const to = (rfq?.customerEmail || "").trim();
      if (!to) {
        notifications.email = {
          sent: false,
          error: "No email address on this lead",
        };
      } else {
        try {
          const sent = await sendGmailEmail({
            to,
            subject: emailSubject,
            text: emailBody,
          });
          notifications.email = { sent: true, to, messageId: sent.messageId };

          await prisma.rfqMessage.create({
            data: {
              rfqId: input.rfqId,
              direction: "OUT",
              channel: "EMAIL",
              body: emailBody,
              meta: {
                kind: "reminder_notify",
                followUpId: followUp.id,
                to,
                messageId: sent.messageId,
                subject: emailSubject,
              },
            },
          });

          await logLeadActivity({
            rfqId: input.rfqId,
            type: "EMAIL_SENT",
            title: `Reminder email sent to ${to}`,
            body: emailBody,
            actorId: input.createdById,
            meta: {
              kind: "reminder_notify",
              followUpId: followUp.id,
              to,
              messageId: sent.messageId,
            },
          });
        } catch (err) {
          notifications.email = {
            sent: false,
            to,
            error: err instanceof Error ? err.message : "Could not send email",
          };
        }
      }
    }

    if (input.notifyWhatsapp) {
      const to = (rfq?.customerPhone || "").trim();
      if (!to) {
        notifications.whatsapp = {
          sent: false,
          error: "No phone number on this lead",
        };
      } else {
        try {
          const sent = await sendWhatsAppText({ to, body: whatsappBody });
          notifications.whatsapp = {
            sent: true,
            to: sent.to || to,
            messageId: sent.messageId,
          };

          await prisma.rfqMessage.create({
            data: {
              rfqId: input.rfqId,
              direction: "OUT",
              channel: "WHATSAPP",
              body: whatsappBody,
              meta: {
                kind: "reminder_notify",
                followUpId: followUp.id,
                to: sent.to || to,
                messageId: sent.messageId,
              },
            },
          });

          await logLeadActivity({
            rfqId: input.rfqId,
            type: "WHATSAPP",
            title: `Reminder WhatsApp sent to ${sent.to || to}`,
            body: whatsappBody,
            actorId: input.createdById,
            meta: {
              kind: "reminder_notify",
              followUpId: followUp.id,
              to: sent.to || to,
              messageId: sent.messageId,
            },
          });
        } catch (err) {
          notifications.whatsapp = {
            sent: false,
            to,
            error:
              err instanceof Error ? err.message : "Could not send WhatsApp",
          };
        }
      }
    }
  }

  return { followUp, notifications };
}

export async function completeFollowUp(input: {
  id: string;
  actorId?: string | null;
  notes?: string;
}) {
  const existing = await prisma.leadFollowUp.findUniqueOrThrow({
    where: { id: input.id },
  });

  const followUp = await prisma.leadFollowUp.update({
    where: { id: input.id },
    data: {
      status: "DONE",
      completedAt: new Date(),
      notes: input.notes !== undefined ? input.notes : existing.notes,
    },
  });

  const nextPending = await prisma.leadFollowUp.findFirst({
    where: { rfqId: existing.rfqId, status: "PENDING" },
    orderBy: { dueAt: "asc" },
  });

  await prisma.rfq.update({
    where: { id: existing.rfqId },
    data: { nextFollowUpAt: nextPending?.dueAt || null },
  });

  await logLeadActivity({
    rfqId: existing.rfqId,
    type: "FOLLOW_UP_COMPLETED",
    title: existing.title || "Follow-up completed",
    body: input.notes || existing.notes || "",
    actorId: input.actorId,
    meta: { followUpId: followUp.id },
  });

  return followUp;
}

export async function refreshOverdueFollowUps() {
  const now = new Date();
  await prisma.leadFollowUp.updateMany({
    where: { status: "PENDING", dueAt: { lt: now } },
    data: { status: "OVERDUE" },
  });
}

export async function listFollowUps(input: {
  assignedToId?: string;
  status?: FollowUpStatus | FollowUpStatus[];
  dueBefore?: Date;
  dueAfter?: Date;
  take?: number;
}) {
  const statuses = input.status
    ? Array.isArray(input.status)
      ? input.status
      : [input.status]
    : undefined;

  return prisma.leadFollowUp.findMany({
    where: {
      ...(input.assignedToId ? { assignedToId: input.assignedToId } : {}),
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(input.dueBefore || input.dueAfter
        ? {
            dueAt: {
              ...(input.dueAfter ? { gte: input.dueAfter } : {}),
              ...(input.dueBefore ? { lte: input.dueBefore } : {}),
            },
          }
        : {}),
    },
    orderBy: { dueAt: "asc" },
    take: input.take ?? 100,
    include: {
      rfq: {
        select: {
          id: true,
          leadNumber: true,
          customerName: true,
          customerCompany: true,
          leadStage: true,
          priority: true,
        },
      },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });
}
