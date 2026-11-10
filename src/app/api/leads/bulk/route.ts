import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LeadPriority, LeadStage } from "@prisma/client";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { assignLead } from "@/lib/leads/assignment";
import { changeLeadStage } from "@/lib/leads/stage";
import { logLeadActivity } from "@/lib/leads/activity";

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
  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const id of ids) {
    try {
      if (action === "assign") {
        await assignLead({
          rfqId: id,
          toUserId: parsed.data.assignedToUserId ?? null,
          actorId: session?.user?.id,
          reason: "Bulk assignment",
        });
      } else if (action === "stage") {
        if (!parsed.data.toStage) throw new Error("toStage required");
        await changeLeadStage({
          rfqId: id,
          toStage: parsed.data.toStage,
          reason: parsed.data.reason,
          actorId: session?.user?.id,
        });
      } else if (action === "priority") {
        if (!parsed.data.priority) throw new Error("priority required");
        await prisma.rfq.update({
          where: { id },
          data: {
            priority: parsed.data.priority,
          },
        });
        await logLeadActivity({
          rfqId: id,
          type: "OTHER",
          title: `Priority → ${parsed.data.priority}`,
          actorId: session?.user?.id,
        });
      } else if (action === "archive" || action === "delete") {
        await prisma.rfq.update({
          where: { id },
          data: { archivedAt: new Date() },
        });
        await logLeadActivity({
          rfqId: id,
          type: "OTHER",
          title: "Lead archived (bulk)",
          actorId: session?.user?.id,
        });
      }
      results.push({ id, ok: true });
    } catch (e) {
      results.push({
        id,
        ok: false,
        error: e instanceof Error ? e.message : "Failed",
      });
    }
  }

  return NextResponse.json({
    results,
    success: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
}
