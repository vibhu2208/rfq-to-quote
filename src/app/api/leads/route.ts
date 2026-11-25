import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { LeadStage } from "@prisma/client";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { applyAssignmentRules } from "@/lib/leads/assignment";
import { LEAD_STAGES } from "@/lib/leads/constants";
import { findDuplicateLeads } from "@/lib/leads/duplicates";
import {
  buildLeadWhere,
  parseLeadFiltersFromSearchParams,
} from "@/lib/leads/filters";
import { createRfqWithMessage } from "@/lib/rfq";
import {
  leadListOrderBy,
  parseLeadListSort,
  parseLeadListSortDir,
} from "@/lib/leads/sort";

/** Slim list projection — table cells only, no parse/marketplace blobs. */
const leadListSelect = {
  id: true,
  leadNumber: true,
  channel: true,
  subject: true,
  rawText: true,
  customerName: true,
  customerCompany: true,
  customerEmail: true,
  customerPhone: true,
  category: true,
  parsedCategory: true,
  leadStage: true,
  priority: true,
  intakeKind: true,
  junkReason: true,
  stageDetail: true,
  expectedValue: true,
  expectedClosureAt: true,
  nextFollowUpAt: true,
  slaDueAt: true,
  slaBreachedAt: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { id: true, name: true, email: true } },
  quotes: {
    select: {
      id: true,
      quoteNumber: true,
      quoteName: true,
      status: true,
      grandTotal: true,
      version: true,
      createdAt: true,
      sentAt: true,
    },
    orderBy: { createdAt: "desc" as const },
    take: 5,
  },
  _count: {
    select: { quotes: true, messages: true, followUps: true, attachments: true },
  },
};

function truncate(text: string, max: number) {
  if (!text || text.length <= max) return text || "";
  return `${text.slice(0, max).trimEnd()}…`;
}

function slimListItem<T extends { rawText: string }>(row: T) {
  return {
    ...row,
    rawText: truncate(row.rawText, 160),
    activities: [] as const,
  };
}

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const filters = parseLeadFiltersFromSearchParams(
    searchParams,
    session?.user?.id
  );
  if (searchParams.get("mine") === "1" && session?.user?.id) {
    filters.assignedToUserId = "me";
    filters.mineUserId = session.user.id;
  }

  const take = Math.min(Number(searchParams.get("take") || 100) || 100, 500);
  const skip = Math.max(Number(searchParams.get("skip") || 0) || 0, 0);
  const sort = parseLeadListSort(searchParams.get("sort"));
  const sortDir = parseLeadListSortDir(searchParams.get("dir"));
  const where = buildLeadWhere(filters);
  const countsOnly = searchParams.get("countsOnly") === "1";
  const includeCounts =
    !countsOnly && searchParams.get("includeCounts") !== "0";

  const intakeBase = buildLeadWhere({
    ...filters,
    intakeKind: undefined,
    stage: undefined,
    wonOnly: false,
    lostOnly: false,
    hotOnly: false,
  });

  const stageWhere = buildLeadWhere({
    ...filters,
    stage: undefined,
  });

  const [items, total, stageGroups, intakeGroups] = await Promise.all([
    countsOnly
      ? Promise.resolve([])
      : prisma.rfq.findMany({
          where,
          orderBy: leadListOrderBy(sort, sortDir),
          take,
          skip,
          select: leadListSelect,
        }),
    countsOnly ? Promise.resolve(0) : prisma.rfq.count({ where }),
    includeCounts || countsOnly
      ? prisma.rfq.groupBy({
          by: ["leadStage"],
          where: stageWhere,
          _count: { _all: true },
        })
      : Promise.resolve([]),
    includeCounts || countsOnly
      ? prisma.rfq.groupBy({
          by: ["intakeKind"],
          where: intakeBase,
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const stageCounts = Object.fromEntries(
    LEAD_STAGES.map((s) => [s, 0])
  ) as Record<LeadStage, number>;
  for (const row of stageGroups) {
    stageCounts[row.leadStage] = row._count._all;
  }

  const intakeKindCounts = {
    REQUIREMENT: 0,
    JUNK: 0,
    SKIPPED: 0,
  };
  for (const row of intakeGroups) {
    intakeKindCounts[row.intakeKind] = row._count._all;
  }

  if (countsOnly) {
    return NextResponse.json({ stageCounts, intakeKindCounts });
  }

  const leadIds = items.map((row) => row.id);
  const drafts = leadIds.length
    ? await prisma.quote.findMany({
        where: { rfqId: { in: leadIds }, status: "DRAFT" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          rfqId: true,
          quoteNumber: true,
          status: true,
          grandTotal: true,
          version: true,
          createdAt: true,
          sentAt: true,
        },
      })
    : [];
  const newestDraft = new Map<string, (typeof drafts)[number]>();
  for (const draft of drafts) {
    const rfqId = draft.rfqId;
    // Quotes with no lead are never attached to a list row.
    if (!rfqId || newestDraft.has(rfqId)) continue;
    newestDraft.set(rfqId, draft);
  }

  return NextResponse.json({
    items: items.map((row) => {
      const slim = slimListItem(row);
      const draft = newestDraft.get(row.id);
      if (!draft || slim.quotes.some((quote) => quote.id === draft.id)) return slim;
      // The five newest quotes can hide an older draft. Keep that draft so Continue quote opens it.
      return {
        ...slim,
        quotes: [
          ...slim.quotes,
          {
            id: draft.id,
            quoteNumber: draft.quoteNumber,
            status: draft.status,
            grandTotal: draft.grandTotal,
            version: draft.version,
            createdAt: draft.createdAt,
            sentAt: draft.sentAt,
          },
        ],
      };
    }),
    total,
    stageCounts: includeCounts ? stageCounts : {},
    intakeKindCounts: includeCounts ? intakeKindCounts : {},
    filters,
  });
}

const createSchema = z.object({
  channel: z
    .enum([
      "MANUAL",
      "REFERRAL",
      "API",
      "OTHER",
      "WHATSAPP",
      "EMAIL",
      "WEB_FORM",
      "MARKETPLACE",
      "IMPORT",
    ])
    .optional()
    .default("MANUAL"),
  customerName: z.string().min(1),
  customerCompany: z.string().optional().default(""),
  customerEmail: z.string().optional().default(""),
  customerPhone: z.string().optional().default(""),
  subject: z.string().optional().default(""),
  requirement: z.string().min(1),
  category: z.string().optional().default(""),
  priority: z.enum(["HOT", "HIGH", "MEDIUM", "LOW"]).optional().default("MEDIUM"),
  expectedValue: z.number().optional(),
  expectedClosureAt: z.string().optional(),
  referralSource: z.string().optional().default(""),
  assignedToUserId: z.string().optional().nullable(),
  skipDuplicateCheck: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;

  if (!d.skipDuplicateCheck) {
    const dupes = await findDuplicateLeads({
      email: d.customerEmail,
      phone: d.customerPhone,
      company: d.customerCompany,
    });
    if (dupes.length) {
      return NextResponse.json(
        { error: "Possible duplicates found", duplicates: dupes },
        { status: 409 }
      );
    }
  }

  const rfq = await createRfqWithMessage({
    channel: d.channel,
    sourceRef: `${d.channel.toLowerCase()}-${Date.now()}`,
    subject: d.subject || `Lead: ${d.requirement.slice(0, 80)}`,
    rawText: d.requirement,
    customerName: d.customerName,
    customerCompany: d.customerCompany,
    customerEmail: d.customerEmail,
    customerPhone: d.customerPhone,
  });

  const updated = await prisma.rfq.update({
    where: { id: rfq.id },
    data: {
      category: d.category,
      priority: d.priority,
      referralSource: d.referralSource,
      expectedValue: d.expectedValue ?? null,
      expectedClosureAt: d.expectedClosureAt
        ? new Date(d.expectedClosureAt)
        : null,
      assignedToUserId: d.assignedToUserId || null,
    },
    select: leadListSelect,
  });

  if (!d.assignedToUserId) {
    try {
      await applyAssignmentRules({ rfqId: rfq.id });
    } catch {
      // best-effort
    }
  }

  return NextResponse.json(slimListItem(updated), { status: 201 });
}
