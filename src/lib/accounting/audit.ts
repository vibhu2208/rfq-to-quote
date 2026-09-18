import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function writeAuditEvent(input: {
  organisationId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  tx?: Prisma.TransactionClient;
}) {
  const client = input.tx ?? prisma;
  return client.auditEvent.create({
    data: {
      organisationId: input.organisationId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: (input.before as Prisma.InputJsonValue) ?? undefined,
      after: (input.after as Prisma.InputJsonValue) ?? undefined,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
}

/** Transaction-safe alias used by posting services. */
export async function recordAuditEvent(
  tx: Prisma.TransactionClient,
  input: {
    organisationId: string;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
    correlationId?: string | null;
  }
) {
  return writeAuditEvent({ ...input, tx });
}
