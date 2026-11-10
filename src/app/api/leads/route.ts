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

const leadInclude = {
  assignedTo: { select: { id: true, name: true, email: true } },
  quotes: {
    select: {
      id: true,
      quoteNumber: true,
      status: true,
      grandTotal: true,
      version: true,
      createdAt: true,
      sentAt: true,
    },
    orderBy: { createdAt: "desc" as const },
    take: 40,
  },
  activities: {
    select: { id: true, type: true, title: true, body: true, createdAt: true },
    orderBy: { createdAt: "desc" as const },
    take: 20,
  },
  _count: { select: { quotes: true, messages: true, followUps: true } },
};

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
  const where = buildLeadWhere(filters);

  const intakeBase = buildLeadWhere({
    ...filters,
    intakeKind: undefined,
    stage: undefined,
    wonOnly: false,
    lostOnly: false,
    hotOnly: false,
  });

  const [items, total, stageGroups, intakeGroups] = await Promise.all([
    prisma.rfq.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: leadInclude,
    }),
    prisma.rfq.count({ where }),
    prisma.rfq.groupBy({
      by: ["leadStage"],
      where: buildLeadWhere({
        ...filters,
        stage: undefined,
        wonOnly: false,
        lostOnly: false,
        hotOnly: false,
      }),
      _count: { _all: true },
    }),
    prisma.rfq.groupBy({
      by: ["intakeKind"],
      where: intakeBase,
      _count: { _all: true },
    }),
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

  return NextResponse.json({
    items,
    total,
    stageCounts,
    intakeKindCounts,
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
    include: leadInclude,
  });

  if (!d.assignedToUserId) {
    try {
      await applyAssignmentRules({ rfqId: rfq.id });
    } catch {
      // best-effort
    }
  }

  return NextResponse.json(updated, { status: 201 });
}
