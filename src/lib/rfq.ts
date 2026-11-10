import {
  Prisma,
  type LeadIntakeKind,
  type RfqChannel,
  type RfqStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseRfqWithAi, statusFromConfidence } from "@/lib/ai/parse-rfq";
import { normalizeParsedItemCategories } from "@/lib/categories";
import { applyAssignmentRules } from "@/lib/leads/assignment";
import { logLeadActivity } from "@/lib/leads/activity";
import { DEFAULT_SLA_HOURS } from "@/lib/leads/constants";
import { nextLeadNumber } from "@/lib/leads/numbers";
import { addHours } from "@/lib/leads/stage";

function itemLineFingerprint(items: unknown[]): string {
  return items
    .map((row, index) => {
      if (!row || typeof row !== "object") return `${index + 1}:`;
      const item = row as { description?: unknown; quantity?: unknown; unit?: unknown };
      const description = String(item.description || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      const quantity = Number(item.quantity) || 1;
      const unit = String(item.unit || "pcs").trim().toLowerCase();
      return `${index + 1}:${description}|${quantity}|${unit}`;
    })
    .join("\n");
}

function nextStatusAfterParse(
  current: RfqStatus,
  fromConfidence: "PARSED" | "NEEDS_REVIEW"
): RfqStatus {
  // Never downgrade terminal workflow states on a re-parse.
  if (current === "QUOTED" || current === "CLOSED") return current;
  return fromConfidence;
}

export type AttachmentMeta = {
  name: string;
  url?: string;
  contentType?: string;
};

export type CreateRfqInput = {
  channel: RfqChannel;
  sourceRef?: string;
  subject?: string;
  rawText: string;
  rawAttachments?: AttachmentMeta[];
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerCompany?: string;
  /** Run OpenRouter parse immediately (default true when key present) */
  autoParse?: boolean;
  /** Junk/skipped mail kept for review; defaults to REQUIREMENT */
  intakeKind?: LeadIntakeKind;
  junkReason?: string;
};

function marketplaceFromEmail(from: string): boolean {
  const lower = from.toLowerCase();
  return (
    lower.includes("indiamart.com") ||
    lower.includes("tradeindia.com") ||
    lower.includes("leads@") ||
    lower.includes("@marketplace")
  );
}

export function resolveEmailChannel(fromEmail: string): RfqChannel {
  return marketplaceFromEmail(fromEmail) ? "MARKETPLACE" : "EMAIL";
}

export async function createRfqWithMessage(input: CreateRfqInput) {
  const intakeKind: LeadIntakeKind = input.intakeKind || "REQUIREMENT";
  const isJunk = intakeKind === "JUNK" || intakeKind === "SKIPPED";
  const autoParse =
    input.autoParse ??
    (!isJunk && Boolean(process.env.OPENROUTER_API_KEY));

  // Deduplicate by sourceRef (email Message-ID / webhook id)
  if (input.sourceRef) {
    const existing = await prisma.rfq.findFirst({
      where: { sourceRef: input.sourceRef },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (existing) return existing;
  }

  const leadNumber = await nextLeadNumber();
  const now = new Date();
  const junkReason = (input.junkReason || "").trim();

  const rfq = await prisma.rfq.create({
    data: {
      channel: input.channel,
      sourceRef: input.sourceRef || "",
      subject: input.subject || "",
      rawText: input.rawText,
      rawAttachments: (input.rawAttachments || []) as Prisma.InputJsonValue,
      customerName: input.customerName || "",
      customerPhone: input.customerPhone || "",
      customerEmail: input.customerEmail || "",
      customerCompany: input.customerCompany || "",
      status: isJunk ? "CLOSED" : "NEW",
      leadNumber,
      leadStage: isJunk ? "DISQUALIFIED" : "NEW_LEAD",
      priority: isJunk ? "LOW" : "MEDIUM",
      intakeKind,
      junkReason,
      disqualifyReason: isJunk
        ? junkReason ||
          (intakeKind === "JUNK"
            ? "Junk / promotional mail"
            : "Skipped — not a clear requirement")
        : "",
      slaDueAt: isJunk ? null : addHours(now, DEFAULT_SLA_HOURS),
      messages: {
        create: {
          direction: "IN",
          channel: input.channel,
          body: input.rawText,
          meta: {
            subject: input.subject || "",
            sourceRef: input.sourceRef || "",
            intakeKind,
            junkReason,
          },
        },
      },
      stageHistory: {
        create: {
          fromStage: null,
          toStage: isJunk ? "DISQUALIFIED" : "NEW_LEAD",
          reason: isJunk
            ? junkReason || "Stored for junk review"
            : "Lead created",
        },
      },
    },
    include: { messages: true },
  });

  await logLeadActivity({
    rfqId: rfq.id,
    type: isJunk ? "OTHER" : "LEAD_CREATED",
    title: isJunk
      ? `${intakeKind === "JUNK" ? "Junk" : "Skipped"} mail stored for review`
      : `Lead ${leadNumber} created`,
    body: input.subject || input.rawText.slice(0, 200),
    meta: { channel: input.channel, intakeKind, junkReason },
  });

  if (!isJunk) {
    try {
      await applyAssignmentRules({ rfqId: rfq.id });
    } catch {
      // Assignment rules are best-effort on intake
    }
  }

  if (autoParse && input.rawText.trim()) {
    try {
      return await parseAndUpdateRfq(rfq.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Parse failed";
      return prisma.rfq.update({
        where: { id: rfq.id },
        data: { parseError: message, status: "NEEDS_REVIEW" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    }
  }

  return prisma.rfq.findUniqueOrThrow({
    where: { id: rfq.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function parseAndUpdateRfq(rfqId: string) {
  const rfq = await prisma.rfq.findUniqueOrThrow({ where: { id: rfqId } });
  const result = await parseRfqWithAi(rfq.rawText, rfq.subject);
  const status = nextStatusAfterParse(
    rfq.status,
    statusFromConfidence(result.confidence)
  );

  const existing =
    rfq.parsedSpecs && typeof rfq.parsedSpecs === "object"
      ? (rfq.parsedSpecs as Record<string, unknown>)
      : {};
  const existingMeta =
    existing._meta && typeof existing._meta === "object"
      ? (existing._meta as Record<string, unknown>)
      : {};
  const existingItems = Array.isArray(existing.items) ? existing.items : [];
  const fromSpreadsheet =
    typeof existingMeta.summary === "string" &&
    /imported from spreadsheet/i.test(existingMeta.summary);
  const rawItems =
    fromSpreadsheet && existingItems.length > 0 ? existingItems : result.items;
  const normalized = normalizeParsedItemCategories(
    rawItems.map((row, index) => {
      const item =
        row && typeof row === "object"
          ? (row as Record<string, unknown>)
          : {};
      return {
        ...item,
        description:
          typeof item.description === "string"
            ? item.description
            : String(item.description || `Item ${index + 1}`),
        brand: typeof item.brand === "string" ? item.brand : null,
        category: typeof item.category === "string" ? item.category : null,
        quantity:
          typeof item.quantity === "number" && Number.isFinite(item.quantity)
            ? item.quantity
            : 1,
        unit: typeof item.unit === "string" ? item.unit : "pcs",
      };
    }),
    result.productCategory
  );
  const items = normalized.items;
  const linesChanged =
    itemLineFingerprint(existingItems) !== itemLineFingerprint(items);

  return prisma.rfq.update({
    where: { id: rfqId },
    data: {
      parsedCategory: normalized.productCategory,
      parsedSpecs: {
        ...result.specs,
        items,
        _meta: {
          language: result.language,
          summary: fromSpreadsheet
            ? String(existingMeta.summary)
            : result.summary,
          itemCount: items.length,
        },
      } as Prisma.InputJsonValue,
      parseConfidence: result.confidence,
      parseError: null,
      status,
      // Drop catalog/vendor picks when the requirement lines themselves changed.
      ...(linesChanged ? { productSelections: Prisma.DbNull } : {}),
      marketplacePrices: Prisma.DbNull,
      marketplaceQuery: null,
      marketplaceFetchedAt: null,
    },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      quotes: {
        orderBy: { createdAt: "desc" },
        select: { id: true, quoteNumber: true, status: true, grandTotal: true },
      },
    },
  });
}
