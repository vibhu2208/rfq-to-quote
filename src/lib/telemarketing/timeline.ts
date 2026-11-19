import type { Prisma, TelemarketingTimelineType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function logTelemarketingTimeline(input: {
  contactId: string;
  type: TelemarketingTimelineType;
  title?: string;
  body?: string;
  meta?: Prisma.InputJsonValue;
  actorId?: string | null;
}) {
  return prisma.telemarketingTimelineEvent.create({
    data: {
      contactId: input.contactId,
      type: input.type,
      title: input.title || "",
      body: input.body || "",
      meta: input.meta ?? {},
      actorId: input.actorId || null,
    },
  });
}