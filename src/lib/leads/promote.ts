import { prisma } from "@/lib/prisma";
import { applyAssignmentRules } from "@/lib/leads/assignment";
import { logLeadActivity } from "@/lib/leads/activity";
import { addHours, changeLeadStage } from "@/lib/leads/stage";
import { DEFAULT_SLA_HOURS } from "@/lib/leads/constants";
import { parseAndUpdateRfq } from "@/lib/rfq";

/** Promote a junk/skipped inbound item into a normal requirement lead. */
export async function promoteLeadFromJunk(input: {
  rfqId: string;
  actorId?: string | null;
  reason?: string;
  autoParse?: boolean;
}) {
  const rfq = await prisma.rfq.findUniqueOrThrow({ where: { id: input.rfqId } });

  if (rfq.intakeKind === "REQUIREMENT") {
    return rfq;
  }

  const now = new Date();
  const reason =
    String(input.reason || "").trim() ||
    "Promoted from junk/skipped review to requirement";

  await prisma.rfq.update({
    where: { id: rfq.id },
    data: {
      intakeKind: "REQUIREMENT",
      junkReason: "",
      disqualifyReason: "",
      status: "NEW",
      priority: rfq.priority === "LOW" ? "MEDIUM" : rfq.priority,
      slaDueAt: addHours(now, DEFAULT_SLA_HOURS),
      slaBreachedAt: null,
    },
  });

  await changeLeadStage({
    rfqId: rfq.id,
    toStage: "NEW_LEAD",
    reason,
    actorId: input.actorId,
    force: true,
  });

  await logLeadActivity({
    rfqId: rfq.id,
    type: "OTHER",
    title: "Promoted to requirement lead",
    body: reason,
    actorId: input.actorId,
    meta: { fromIntakeKind: rfq.intakeKind },
  });

  try {
    await applyAssignmentRules({ rfqId: rfq.id });
  } catch {
    // best-effort
  }

  const shouldParse =
    input.autoParse ?? Boolean(process.env.OPENROUTER_API_KEY);
  if (shouldParse && rfq.rawText.trim()) {
    try {
      return await parseAndUpdateRfq(rfq.id);
    } catch {
      // parse is best-effort after promote
    }
  }

  return prisma.rfq.findUniqueOrThrow({ where: { id: rfq.id } });
}
