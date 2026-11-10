import { NextRequest, NextResponse } from "next/server";
import { markBreachedSlas } from "@/lib/leads/kpis";
import { refreshOverdueFollowUps } from "@/lib/leads/follow-ups";
import { prisma } from "@/lib/prisma";
import { assignLead } from "@/lib/leads/assignment";
import { OPEN_STAGES } from "@/lib/leads/constants";

/**
 * Escalates SLA-breached leads: mark breach, bump priority, optionally
 * reassign to least-loaded teammate when ?reassign=1.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  await refreshOverdueFollowUps();
  const breachedCount = await markBreachedSlas();

  const reassign = new URL(req.url).searchParams.get("reassign") === "1";
  let reassigned = 0;

  if (reassign) {
    const users = await prisma.user.findMany({
      select: { id: true },
      take: 50,
    });
    if (users.length) {
      const breached = await prisma.rfq.findMany({
        where: {
          slaBreachedAt: { not: null },
          archivedAt: null,
          leadStage: { in: OPEN_STAGES },
        },
        select: { id: true, assignedToUserId: true },
        take: 50,
      });

      for (const lead of breached) {
        const loads = await prisma.rfq.groupBy({
          by: ["assignedToUserId"],
          where: {
            assignedToUserId: { in: users.map((u) => u.id) },
            archivedAt: null,
            leadStage: { in: OPEN_STAGES },
          },
          _count: { _all: true },
        });
        const map = Object.fromEntries(
          users.map((u) => [u.id, 0])
        ) as Record<string, number>;
        for (const g of loads) {
          if (g.assignedToUserId) map[g.assignedToUserId] = g._count._all;
        }
        const sorted = users.slice().sort((a, b) => map[a.id] - map[b.id]);
        const next = sorted.find((u) => u.id !== lead.assignedToUserId);
        if (next) {
          await assignLead({
            rfqId: lead.id,
            toUserId: next.id,
            reason: "SLA escalation reassignment",
          });
          reassigned += 1;
        }
      }
    }
  }

  const overdueFollowUps = await prisma.leadFollowUp.count({
    where: { status: "OVERDUE" },
  });

  return NextResponse.json({
    ok: true,
    breachedCount,
    reassigned,
    overdueFollowUps,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
