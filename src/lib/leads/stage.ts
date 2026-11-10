import type { LeadStage, QuoteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logLeadActivity } from "@/lib/leads/activity";
import { DEFAULT_SLA_HOURS, LEAD_STAGE_LABELS, TERMINAL_STAGES } from "@/lib/leads/constants";

export function isTerminalStage(stage: LeadStage) {
  return TERMINAL_STAGES.includes(stage);
}

export function addHours(from: Date, hours: number) {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

export async function changeLeadStage(input: {
  rfqId: string;
  toStage: LeadStage;
  reason?: string;
  actorId?: string | null;
  stageDetail?: string;
  force?: boolean;
}) {
  const rfq = await prisma.rfq.findUniqueOrThrow({ where: { id: input.rfqId } });

  if (rfq.leadStage === input.toStage && !input.force) {
    return rfq;
  }

  if (
    (input.toStage === "DISQUALIFIED" && !String(input.reason || rfq.disqualifyReason).trim()) ||
    (input.toStage === "DEAL_LOST" && !String(input.reason || rfq.lostReason).trim())
  ) {
    throw new Error(
      input.toStage === "DISQUALIFIED"
        ? "Disqualification reason is required"
        : "Deal lost reason is required"
    );
  }

  const reason = String(input.reason || "").trim();
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.rfq.update({
      where: { id: input.rfqId },
      data: {
        leadStage: input.toStage,
        stageDetail:
          input.stageDetail !== undefined ? input.stageDetail : rfq.stageDetail,
        disqualifyReason:
          input.toStage === "DISQUALIFIED" ? reason || rfq.disqualifyReason : rfq.disqualifyReason,
        lostReason: input.toStage === "DEAL_LOST" ? reason || rfq.lostReason : rfq.lostReason,
        slaDueAt: isTerminalStage(input.toStage)
          ? null
          : addHours(now, DEFAULT_SLA_HOURS),
        slaBreachedAt: null,
      },
    });

    await tx.leadStageHistory.create({
      data: {
        rfqId: input.rfqId,
        fromStage: rfq.leadStage,
        toStage: input.toStage,
        reason,
        actorId: input.actorId || null,
      },
    });

    return next;
  });

  await logLeadActivity({
    rfqId: input.rfqId,
    type: "STAGE_CHANGED",
    title: `Stage → ${LEAD_STAGE_LABELS[input.toStage]}`,
    body: reason,
    actorId: input.actorId,
    meta: { from: rfq.leadStage, to: input.toStage },
  });

  return updated;
}

/** Auto-advance lead stage from quote lifecycle events when not already terminal. */
export async function syncLeadStageFromQuoteStatus(input: {
  rfqId: string | null | undefined;
  quoteStatus: QuoteStatus;
  actorId?: string | null;
}) {
  if (!input.rfqId) return null;

  const rfq = await prisma.rfq.findUnique({ where: { id: input.rfqId } });
  if (!rfq || isTerminalStage(rfq.leadStage)) return rfq;

  let target: LeadStage | null = null;
  let reason = "";

  switch (input.quoteStatus) {
    case "DRAFT":
      // Quote created — move at least to QUOTE_SENT only when sent; keep QUALIFIED-friendly
      if (
        rfq.leadStage === "NEW_LEAD" ||
        rfq.leadStage === "CONTACTED" ||
        rfq.leadStage === "QUALIFIED"
      ) {
        // Stay until sent; no auto move on draft alone
        target = null;
      }
      break;
    case "SENT":
    case "VIEWED":
      target = "QUOTE_SENT";
      reason = `Quote ${input.quoteStatus.toLowerCase()}`;
      break;
    case "UNDER_NEGOTIATION":
    case "REVISED":
      target = "NEGOTIATION";
      reason = `Quote ${input.quoteStatus.toLowerCase()}`;
      break;
    case "ACCEPTED":
    case "INVOICE_GENERATED":
    case "PAYMENT_PENDING":
    case "PAYMENT_RECEIVED":
    case "DELIVERED":
    case "CLOSED":
      target = "CLOSED_WON";
      reason = `Quote ${input.quoteStatus.toLowerCase()}`;
      break;
    case "REJECTED":
      // Do not auto-lose; sales must confirm
      target = null;
      break;
    default:
      target = null;
  }

  if (!target || target === rfq.leadStage) return rfq;

  // Don't regress stages (e.g. NEGOTIATION → QUOTE_SENT)
  const order = [
    "NEW_LEAD",
    "CONTACTED",
    "QUALIFIED",
    "QUOTE_SENT",
    "NEGOTIATION",
    "CLOSED_WON",
  ] as LeadStage[];
  const curIdx = order.indexOf(rfq.leadStage);
  const nextIdx = order.indexOf(target);
  if (curIdx >= 0 && nextIdx >= 0 && nextIdx < curIdx) return rfq;

  return changeLeadStage({
    rfqId: input.rfqId,
    toStage: target,
    reason,
    actorId: input.actorId,
  });
}

/**
 * @deprecated Draft quotation create must not mark QUOTE_SENT.
 * Stage advances only when the quote is actually sent/viewed via
 * `syncLeadStageFromQuoteStatus`. Kept as a no-op for any stale callers.
 */
export async function markLeadQuoted(rfqId: string, _actorId?: string | null) {
  return prisma.rfq.findUnique({ where: { id: rfqId } });
}
