import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LeadPriority, LeadStage, Prisma } from "@prisma/client";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SLA_HOURS, LEAD_STAGE_LABELS } from "@/lib/leads/constants";
import { addHours, isTerminalStage } from "@/lib/leads/stage";

const schema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(["assign", "stage", "priority", "archive", "delete"]),
  assignedToUserId: z.string().nullable().optional(),
  toStage: z.nativeEnum(LeadStage).optional(),
  reason: z.string().optional(),
  priority: z.nativeEnum(LeadPriority).optional(),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { ids, action } = parsed.data;
  const actorId = session?.user?.id || null;
  const uniqueIds = [...new Set(ids)];

  const existing = await prisma.rfq.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      leadStage: true,
      assignedToUserId: true,
      disqualifyReason: true,
      lostReason: true,
      stageDetail: true,
    },
  });
  const byId = new Map(existing.map((r) => [r.id, r]));
  const foundIds = existing.map((r) => r.id);
  const missing = uniqueIds.filter((id) => !byId.has(id));

  if (foundIds.length === 0) {
    return NextResponse.json({
      results: missing.map((id) => ({
        id,
        ok: false,
        error: "Not found",
      })),
      success: 0,
      failed: missing.length,
    });
  }

  try {
    if (action === "priority") {
      if (!parsed.data.priority) {
        return NextResponse.json(
          { error: "priority required" },
          { status: 400 }
        );
      }
      const priority = parsed.data.priority;
      await prisma.$transaction([
        prisma.rfq.updateMany({
          where: { id: { in: foundIds } },
          data: { priority },
        }),
        prisma.leadActivity.createMany({
          data: foundIds.map((id) => ({
            rfqId: id,
            type: "OTHER" as const,
            title: `Priority → ${priority}`,
            body: "",
            actorId,
          })),
        }),
      ]);
    } else if (action === "archive" || action === "delete") {
      const now = new Date();
      await prisma.$transaction([
        prisma.rfq.updateMany({
          where: { id: { in: foundIds } },
          data: { archivedAt: now },
        }),
        prisma.leadActivity.createMany({
          data: foundIds.map((id) => ({
            rfqId: id,
            type: "OTHER" as const,
            title: "Lead archived (bulk)",
            body: "",
            actorId,
          })),
        }),
      ]);
    } else if (action === "assign") {
      const toUserId = parsed.data.assignedToUserId ?? null;
      const reason = "Bulk assignment";
      const changing = existing.filter((r) => r.assignedToUserId !== toUserId);
      const changingIds = changing.map((r) => r.id);
      if (changingIds.length > 0) {
        await prisma.$transaction(async (tx) => {
          await tx.rfq.updateMany({
            where: { id: { in: changingIds } },
            data: { assignedToUserId: toUserId },
          });
          await tx.leadOwnershipHistory.createMany({
            data: changing.map((r) => ({
              rfqId: r.id,
              fromUserId: r.assignedToUserId,
              toUserId,
              actorId,
              reason,
            })),
          });
          await tx.leadActivity.createMany({
            data: changingIds.map((id) => ({
              rfqId: id,
              type: "ASSIGNMENT_CHANGED" as const,
              title: toUserId ? "Lead reassigned" : "Lead unassigned",
              body: reason,
              actorId,
              meta: { toUserId } as Prisma.InputJsonValue,
            })),
          });
        });
      }
    } else if (action === "stage") {
      if (!parsed.data.toStage) {
        return NextResponse.json(
          { error: "toStage required" },
          { status: 400 }
        );
      }
      const toStage = parsed.data.toStage;
      const reason = String(parsed.data.reason || "").trim();
      if (
        (toStage === "DISQUALIFIED" || toStage === "DEAL_LOST") &&
        !reason
      ) {
        return NextResponse.json(
          {
            error:
              toStage === "DISQUALIFIED"
                ? "Disqualification reason is required"
                : "Deal lost reason is required",
          },
          { status: 400 }
        );
      }

      const changing = existing.filter((r) => r.leadStage !== toStage);
      const changingIds = changing.map((r) => r.id);
      if (changingIds.length > 0) {
        const now = new Date();
        await prisma.$transaction(async (tx) => {
          await tx.rfq.updateMany({
            where: { id: { in: changingIds } },
            data: {
              leadStage: toStage,
              ...(toStage === "DISQUALIFIED"
                ? { disqualifyReason: reason }
                : {}),
              ...(toStage === "DEAL_LOST" ? { lostReason: reason } : {}),
              slaDueAt: isTerminalStage(toStage)
                ? null
                : addHours(now, DEFAULT_SLA_HOURS),
              slaBreachedAt: null,
            },
          });
          await tx.leadStageHistory.createMany({
            data: changing.map((r) => ({
              rfqId: r.id,
              fromStage: r.leadStage,
              toStage,
              reason,
              actorId,
            })),
          });
          await tx.leadActivity.createMany({
            data: changingIds.map((id) => ({
              rfqId: id,
              type: "STAGE_CHANGED" as const,
              title: `Stage → ${LEAD_STAGE_LABELS[toStage]}`,
              body: reason,
              actorId,
              meta: { to: toStage } as Prisma.InputJsonValue,
            })),
          });
        });
      }
    }
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Bulk update failed",
        results: uniqueIds.map((id) => ({
          id,
          ok: false,
          error: e instanceof Error ? e.message : "Failed",
        })),
        success: 0,
        failed: uniqueIds.length,
      },
      { status: 500 }
    );
  }

  const results = [
    ...foundIds.map((id) => ({ id, ok: true })),
    ...missing.map((id) => ({ id, ok: false, error: "Not found" })),
  ];

  return NextResponse.json({
    results,
    success: foundIds.length,
    failed: missing.length,
  });
}
