import type { FollowUpStatus, FollowUpType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logLeadActivity } from "@/lib/leads/activity";

export async function createFollowUp(input: {
  rfqId: string;
  type?: FollowUpType;
  dueAt: Date;
  title?: string;
  notes?: string;
  assignedToId?: string | null;
  createdById?: string | null;
}) {
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
    meta: { followUpId: followUp.id, dueAt: input.dueAt.toISOString() },
  });

  return followUp;
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
