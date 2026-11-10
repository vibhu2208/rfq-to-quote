import type { LeadActivityType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function logLeadActivity(input: {
  rfqId: string;
  type: LeadActivityType;
  title?: string;
  body?: string;
  meta?: Prisma.InputJsonValue;
  actorId?: string | null;
}) {
  return prisma.leadActivity.create({
    data: {
      rfqId: input.rfqId,
      type: input.type,
      title: input.title || "",
      body: input.body || "",
      meta: input.meta ?? {},
      actorId: input.actorId || null,
    },
  });
}

export async function listLeadActivities(rfqId: string, take = 100) {
  return prisma.leadActivity.findMany({
    where: { rfqId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
  });
}
