import type { LeadAssignmentRuleType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logLeadActivity } from "@/lib/leads/activity";
import { OPEN_STAGES } from "@/lib/leads/constants";

export async function assignLead(input: {
  rfqId: string;
  toUserId: string | null;
  actorId?: string | null;
  reason?: string;
}) {
  const rfq = await prisma.rfq.findUniqueOrThrow({ where: { id: input.rfqId } });
  if (rfq.assignedToUserId === input.toUserId) return rfq;

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.rfq.update({
      where: { id: input.rfqId },
      data: { assignedToUserId: input.toUserId },
    });
    await tx.leadOwnershipHistory.create({
      data: {
        rfqId: input.rfqId,
        fromUserId: rfq.assignedToUserId,
        toUserId: input.toUserId,
        actorId: input.actorId || null,
        reason: input.reason || "",
      },
    });
    return next;
  });

  await logLeadActivity({
    rfqId: input.rfqId,
    type: "ASSIGNMENT_CHANGED",
    title: input.toUserId ? "Lead reassigned" : "Lead unassigned",
    body: input.reason || "",
    actorId: input.actorId,
    meta: { fromUserId: rfq.assignedToUserId, toUserId: input.toUserId },
  });

  return updated;
}

type RuleConfig = {
  userIds?: string[];
  categoryKeywords?: string[];
  states?: string[];
  cities?: string[];
  lastIndex?: number;
};

async function workloadCounts(userIds: string[]) {
  const groups = await prisma.rfq.groupBy({
    by: ["assignedToUserId"],
    where: {
      assignedToUserId: { in: userIds },
      archivedAt: null,
      leadStage: { in: OPEN_STAGES },
    },
    _count: { _all: true },
  });
  const map = Object.fromEntries(
    userIds.map((id) => [id, 0])
  ) as Record<string, number>;
  for (const g of groups) {
    if (g.assignedToUserId) map[g.assignedToUserId] = g._count._all;
  }
  return map;
}

export async function applyAssignmentRules(input: {
  rfqId: string;
  organisationId?: string | null;
  actorId?: string | null;
}) {
  const rfq = await prisma.rfq.findUniqueOrThrow({ where: { id: input.rfqId } });
  if (rfq.assignedToUserId) return rfq;

  const rules = await prisma.leadAssignmentRule.findMany({
    where: {
      active: true,
      OR: [
        { organisationId: input.organisationId || rfq.organisationId || undefined },
        { organisationId: null },
      ],
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });

  for (const rule of rules) {
    const config = (rule.config || {}) as RuleConfig;
    const userIds = (config.userIds || []).filter(Boolean);
    if (!userIds.length) continue;

    let chosen: string | null = null;

    if (rule.type === "CATEGORY") {
      const keywords = (config.categoryKeywords || []).map((k) => k.toLowerCase());
      const hay = `${rfq.category} ${rfq.parsedCategory || ""}`.toLowerCase();
      if (!keywords.some((k) => hay.includes(k))) continue;
      const loads = await workloadCounts(userIds);
      chosen = userIds.slice().sort((a, b) => loads[a] - loads[b])[0];
    } else if (rule.type === "GEOGRAPHY") {
      const party = rfq.partyId
        ? await prisma.party.findUnique({
            where: { id: rfq.partyId },
            include: { addresses: true },
          })
        : null;
      const states = new Set(
        (party?.addresses || []).map((a) => a.state.toLowerCase())
      );
      const cities = new Set(
        (party?.addresses || []).map((a) => a.city.toLowerCase())
      );
      const matchState = (config.states || []).some((s) =>
        states.has(s.toLowerCase())
      );
      const matchCity = (config.cities || []).some((c) =>
        cities.has(c.toLowerCase())
      );
      if (!matchState && !matchCity) continue;
      const loads = await workloadCounts(userIds);
      chosen = userIds.slice().sort((a, b) => loads[a] - loads[b])[0];
    } else if (rule.type === "WORKLOAD") {
      const loads = await workloadCounts(userIds);
      chosen = userIds.slice().sort((a, b) => loads[a] - loads[b])[0];
    } else if (rule.type === "ROUND_ROBIN") {
      const nextIndex = ((config.lastIndex ?? -1) + 1) % userIds.length;
      chosen = userIds[nextIndex];
      await prisma.leadAssignmentRule.update({
        where: { id: rule.id },
        data: {
          config: {
            ...config,
            lastIndex: nextIndex,
          } as Prisma.InputJsonValue,
        },
      });
    }

    if (chosen) {
      return assignLead({
        rfqId: input.rfqId,
        toUserId: chosen,
        actorId: input.actorId,
        reason: `Auto-assigned via rule: ${rule.name}`,
      });
    }
  }

  return rfq;
}

export async function upsertAssignmentRule(input: {
  id?: string;
  organisationId?: string | null;
  name: string;
  type: LeadAssignmentRuleType;
  active?: boolean;
  priority?: number;
  config?: RuleConfig;
  createdById?: string | null;
}) {
  if (input.id) {
    return prisma.leadAssignmentRule.update({
      where: { id: input.id },
      data: {
        name: input.name,
        type: input.type,
        active: input.active ?? true,
        priority: input.priority ?? 100,
        config: (input.config || {}) as Prisma.InputJsonValue,
        organisationId: input.organisationId || null,
      },
    });
  }

  return prisma.leadAssignmentRule.create({
    data: {
      name: input.name,
      type: input.type,
      active: input.active ?? true,
      priority: input.priority ?? 100,
      config: (input.config || {}) as Prisma.InputJsonValue,
      organisationId: input.organisationId || null,
      createdById: input.createdById || null,
    },
  });
}
