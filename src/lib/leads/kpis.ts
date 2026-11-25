import type { LeadStage, Prisma } from "@prisma/client";
import {
  endOfDay,
  format,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import { prisma } from "@/lib/prisma";
import { LEAD_STAGES } from "@/lib/leads/constants";
import { buildLeadWhere, type LeadFilters } from "@/lib/leads/filters";
import { refreshOverdueFollowUps } from "@/lib/leads/follow-ups";

export type LeadKpis = {
  totalLeads: number;
  filteredLeads: number;
  byStage: Record<LeadStage, number>;
  newLeads: number;
  contacted: number;
  qualified: number;
  quotationsSent: number;
  hotUrgent: number;
  leadsWon: number;
  dealsLost: number;
  disqualified: number;
  conversionRate: number;
  quotationToWinRatio: number;
  monthlyAcquisition: { month: string; count: number }[];
  stageDistribution: { stage: LeadStage; count: number }[];
  pendingFollowUps: number;
  overdueFollowUps: number;
  /** Junk + skipped mail excluded from the requirement totals. */
  excludedIntake: number;
  sourcePerformance: { channel: string; count: number; won: number }[];
  salespersonPerformance: {
    userId: string;
    name: string;
    email: string;
    total: number;
    won: number;
    lost: number;
  }[];
};

export async function computeLeadKpis(
  filters: LeadFilters = {},
  options: { refreshOverdue?: boolean; profile?: "full" | "dashboard" } = {}
): Promise<LeadKpis> {
  const dashboard = options.profile === "dashboard";
  // Dashboard reads must not wait on a write that flips overdue rows.
  if (options.refreshOverdue !== false && !dashboard) {
    await refreshOverdueFollowUps();
  }

  // KPIs stay on real requirements unless an intake filter is explicit.
  const kpiFilters: LeadFilters = {
    ...filters,
    intakeKind: filters.intakeKind ?? "REQUIREMENT",
  };
  const filteredWhere = buildLeadWhere(kpiFilters);
  const totalWhere: Prisma.RfqWhereInput = {
    archivedAt: null,
    intakeKind: "REQUIREMENT",
  };

  const [
    totalLeads,
    filteredLeads,
    stageGroups,
    hotUrgent,
    quotedReached,
    monthlyRows,
    sourceGroups,
    assigneeGroups,
    pendingFollowUps,
    overdueFollowUps,
    excludedIntake,
  ] = await Promise.all([
    prisma.rfq.count({ where: totalWhere }),
    prisma.rfq.count({ where: filteredWhere }),
    prisma.rfq.groupBy({
      by: ["leadStage"],
      where: filteredWhere,
      _count: { _all: true },
    }),
    prisma.rfq.count({
      where: {
        AND: [filteredWhere, { priority: { in: ["HOT", "HIGH"] } }],
      },
    }),
    prisma.rfq.count({
      where: {
        AND: [
          filteredWhere,
          {
            OR: [
              {
                leadStage: {
                  in: ["QUOTE_SENT", "NEGOTIATION", "CLOSED_WON", "DEAL_LOST"],
                },
              },
              { quotes: { some: {} } },
            ],
          },
        ],
      },
    }),
    dashboard
      ? Promise.resolve([] as { createdAt: Date }[])
      : prisma.rfq.findMany({
          where: {
            AND: [
              filteredWhere,
              { createdAt: { gte: startOfMonth(subMonths(new Date(), 11)) } },
            ],
          },
          select: { createdAt: true },
        }),
    dashboard
      ? Promise.resolve([] as { channel: string; _count: { _all: number } }[])
      : prisma.rfq.groupBy({
          by: ["channel"],
          where: filteredWhere,
          _count: { _all: true },
        }),
    dashboard
      ? Promise.resolve(
          [] as { assignedToUserId: string | null; _count: { _all: number } }[]
        )
      : prisma.rfq.groupBy({
          by: ["assignedToUserId"],
          where: filteredWhere,
          _count: { _all: true },
        }),
    prisma.leadFollowUp.count({
      where: { status: { in: ["PENDING", "OVERDUE"] } },
    }),
    prisma.leadFollowUp.count({ where: { status: "OVERDUE" } }),
    prisma.rfq.count({
      where: { archivedAt: null, intakeKind: { in: ["JUNK", "SKIPPED"] } },
    }),
  ]);

  const byStage = Object.fromEntries(
    LEAD_STAGES.map((s) => [s, 0])
  ) as Record<LeadStage, number>;
  for (const row of stageGroups) {
    byStage[row.leadStage] = row._count._all;
  }

  const leadsWon = byStage.CLOSED_WON;
  const dealsLost = byStage.DEAL_LOST;
  const disqualified = byStage.DISQUALIFIED;
  const closedBucket = leadsWon + dealsLost + disqualified;
  const conversionRate = closedBucket > 0 ? leadsWon / closedBucket : 0;
  const quotationToWinRatio = quotedReached > 0 ? leadsWon / quotedReached : 0;

  if (dashboard) {
    return {
      totalLeads,
      filteredLeads,
      byStage,
      newLeads: byStage.NEW_LEAD,
      contacted: byStage.CONTACTED,
      qualified: byStage.QUALIFIED,
      quotationsSent: byStage.QUOTE_SENT + byStage.NEGOTIATION,
      hotUrgent,
      leadsWon,
      dealsLost,
      disqualified,
      conversionRate,
      quotationToWinRatio,
      monthlyAcquisition: [],
      stageDistribution: LEAD_STAGES.map((stage) => ({
        stage,
        count: byStage[stage],
      })),
      pendingFollowUps,
      overdueFollowUps,
      excludedIntake,
      sourcePerformance: [],
      salespersonPerformance: [],
    };
  }

  const monthMap = new Map<string, number>();
  for (let i = 11; i >= 0; i -= 1) {
    monthMap.set(format(subMonths(new Date(), i), "yyyy-MM"), 0);
  }
  for (const row of monthlyRows) {
    const key = format(row.createdAt, "yyyy-MM");
    if (monthMap.has(key)) monthMap.set(key, (monthMap.get(key) || 0) + 1);
  }

  const wonByChannel = await prisma.rfq.groupBy({
    by: ["channel"],
    where: { AND: [filteredWhere, { leadStage: "CLOSED_WON" }] },
    _count: { _all: true },
  });
  const wonChannelMap = Object.fromEntries(
    wonByChannel.map((r) => [r.channel, r._count._all])
  );

  const sourcePerformance = sourceGroups.map((g) => ({
    channel: g.channel,
    count: g._count._all,
    won: wonChannelMap[g.channel] || 0,
  }));

  const userIds = assigneeGroups
    .map((g) => g.assignedToUserId)
    .filter((id): id is string => Boolean(id));
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const wonByUser = await prisma.rfq.groupBy({
    by: ["assignedToUserId"],
    where: { AND: [filteredWhere, { leadStage: "CLOSED_WON" }] },
    _count: { _all: true },
  });
  const lostByUser = await prisma.rfq.groupBy({
    by: ["assignedToUserId"],
    where: {
      AND: [filteredWhere, { leadStage: { in: ["DEAL_LOST", "DISQUALIFIED"] } }],
    },
    _count: { _all: true },
  });
  const wonUserMap = Object.fromEntries(
    wonByUser.map((r) => [r.assignedToUserId || "unassigned", r._count._all])
  );
  const lostUserMap = Object.fromEntries(
    lostByUser.map((r) => [r.assignedToUserId || "unassigned", r._count._all])
  );

  const salespersonPerformance = assigneeGroups.map((g) => {
    const id = g.assignedToUserId || "unassigned";
    const user = g.assignedToUserId ? userMap[g.assignedToUserId] : null;
    return {
      userId: id,
      name: user?.name || "Unassigned",
      email: user?.email || "",
      total: g._count._all,
      won: wonUserMap[id] || 0,
      lost: lostUserMap[id] || 0,
    };
  });

  return {
    totalLeads,
    filteredLeads,
    byStage,
    newLeads: byStage.NEW_LEAD,
    contacted: byStage.CONTACTED,
    qualified: byStage.QUALIFIED,
    quotationsSent: byStage.QUOTE_SENT + byStage.NEGOTIATION,
    hotUrgent,
    leadsWon,
    dealsLost,
    disqualified,
    conversionRate,
    quotationToWinRatio,
    monthlyAcquisition: [...monthMap.entries()].map(([month, count]) => ({
      month,
      count,
    })),
    stageDistribution: LEAD_STAGES.map((stage) => ({
      stage,
      count: byStage[stage],
    })),
    pendingFollowUps,
    overdueFollowUps,
    excludedIntake,
    sourcePerformance,
    salespersonPerformance,
  };
}

export async function markBreachedSlas() {
  const now = new Date();
  const breached = await prisma.rfq.findMany({
    where: {
      archivedAt: null,
      slaDueAt: { lt: now },
      slaBreachedAt: null,
      leadStage: {
        notIn: ["CLOSED_WON", "DISQUALIFIED", "DEAL_LOST"],
      },
    },
    select: { id: true, priority: true },
    take: 200,
  });

  if (breached.length > 0) {
    await prisma.$transaction([
      ...breached.map((lead) =>
        prisma.rfq.update({
          where: { id: lead.id },
          data: {
            slaBreachedAt: now,
            priority:
              lead.priority === "LOW" || lead.priority === "MEDIUM"
                ? "HIGH"
                : lead.priority,
          },
        })
      ),
      prisma.leadActivity.createMany({
        data: breached.map((lead) => ({
          rfqId: lead.id,
          type: "SLA_BREACHED" as const,
          title: "SLA breached",
          body: "Lead response SLA exceeded; priority escalated if applicable.",
        })),
      }),
    ]);
  }

  return breached.length;
}

export function todayRange() {
  const now = new Date();
  return { gte: startOfDay(now), lte: endOfDay(now) };
}
