import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { assignLead } from "@/lib/leads/assignment";
import { logLeadActivity } from "@/lib/leads/activity";
import { listLeadActivities } from "@/lib/leads/activity";
import { normalizeStoredCustomerIdentity } from "@/lib/email-text";
import { resolveCustomerIdentityFromEmail } from "@/lib/ai/extract-signature-identity";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  customerName: z.string().optional(),
  customerCompany: z.string().optional(),
  customerEmail: z.string().optional(),
  customerPhone: z.string().optional(),
  subject: z.string().optional(),
  rawText: z.string().optional(),
  category: z.string().optional(),
  priority: z.enum(["HOT", "HIGH", "MEDIUM", "LOW"]).optional(),
  stageDetail: z.string().optional(),
  expectedValue: z.number().nullable().optional(),
  expectedClosureAt: z.string().nullable().optional(),
  referralSource: z.string().optional(),
  assignedToUserId: z.string().nullable().optional(),
  partyId: z.string().nullable().optional(),
  organisationId: z.string().nullable().optional(),
  archived: z.boolean().optional(),
  note: z.string().optional(),
});

/** Drawer-only payload: skips party nests, ownership, invoices, unbounded messages. */
async function getDrawerLead(id: string) {
  const lead = await prisma.rfq.findUnique({
    where: { id },
    select: {
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
      parsedSpecs: true,
      parseConfidence: true,
      parseError: true,
      leadStage: true,
      priority: true,
      intakeKind: true,
      junkReason: true,
      expectedValue: true,
      expectedClosureAt: true,
      nextFollowUpAt: true,
      disqualifyReason: true,
      createdAt: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      quotes: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          quoteNumber: true,
          status: true,
          grandTotal: true,
          version: true,
          needsAssistance: true,
          assistanceReason: true,
          lastBuyerReplyAt: true,
          lastReplyIntent: true,
          lastAnalysisSummary: true,
          messages: {
            where: { direction: "IN" },
            orderBy: { createdAt: "desc" },
            take: 2,
            select: {
              id: true,
              subject: true,
              body: true,
              intent: true,
              analysis: true,
              createdAt: true,
              fromEmail: true,
            },
          },
        },
      },
      followUps: {
        where: { status: "PENDING" },
        orderBy: { dueAt: "asc" },
        take: 8,
        select: {
          id: true,
          type: true,
          status: true,
          dueAt: true,
          title: true,
          notes: true,
        },
      },
    },
  });
  if (!lead) return null;
  const activities = await listLeadActivities(id, 40);
  return { ...lead, activities, invoices: [] as unknown[] };
}

async function getFullLead(id: string) {
  const lead = await prisma.rfq.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      party: {
        include: {
          addresses: true,
          contacts: true,
        },
      },
      messages: { orderBy: { createdAt: "asc" } },
      quotes: {
        orderBy: { createdAt: "desc" },
        include: {
          proformaInvoices: {
            select: {
              id: true,
              number: true,
              status: true,
              total: true,
              createdAt: true,
            },
          },
          messages: {
            where: { direction: "IN" },
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
              id: true,
              subject: true,
              body: true,
              intent: true,
              analysis: true,
              createdAt: true,
              fromEmail: true,
            },
          },
        },
      },
      stageHistory: {
        orderBy: { createdAt: "desc" },
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
      },
      followUps: {
        orderBy: { dueAt: "asc" },
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
        },
      },
      ownershipHistory: {
        orderBy: { createdAt: "desc" },
        include: {
          fromUser: { select: { id: true, name: true, email: true } },
          toUser: { select: { id: true, name: true, email: true } },
          actor: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!lead) return null;

  const activities = await listLeadActivities(id, 200);

  const proformaIds = lead.quotes.flatMap((q) =>
    q.proformaInvoices.map((p) => p.id)
  );
  const invoices = proformaIds.length
    ? await prisma.invoice.findMany({
        where: { proformaInvoiceId: { in: proformaIds } },
        select: {
          id: true,
          number: true,
          status: true,
          total: true,
          createdAt: true,
          proformaInvoiceId: true,
        },
      })
    : [];

  return { ...lead, activities, invoices };
}

async function repairCustomerIdentityFromBody<
  T extends {
    id: string;
    rawText?: string | null;
    customerName?: string | null;
    customerCompany?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
  },
>(lead: T): Promise<T> {
  const heuristic = normalizeStoredCustomerIdentity({
    rawText: lead.rawText,
    customerName: lead.customerName,
    customerCompany: lead.customerCompany,
    customerPhone: lead.customerPhone,
    customerEmail: lead.customerEmail,
  });

  let next = {
    customerName: heuristic.customerName,
    customerCompany: heuristic.customerCompany,
    customerPhone: heuristic.customerPhone,
    customerEmail: heuristic.customerEmail,
  };

  // If heuristics still look weak, ask Gemini Flash Lite (signature only).
  if (!next.customerCompany.trim() || !next.customerPhone.trim()) {
    const resolved = await resolveCustomerIdentityFromEmail(
      lead.rawText || "",
      next.customerName,
      next.customerEmail
    );
    next = {
      customerName: resolved.customerName || next.customerName,
      customerCompany: resolved.customerCompany || next.customerCompany,
      customerPhone: resolved.customerPhone || next.customerPhone,
      customerEmail: resolved.customerEmail || next.customerEmail,
    };
  }

  const changed =
    next.customerName !== String(lead.customerName || "").trim() ||
    next.customerCompany !== String(lead.customerCompany || "").trim() ||
    next.customerPhone !== String(lead.customerPhone || "").trim() ||
    next.customerEmail !== String(lead.customerEmail || "").trim();

  if (!changed) return lead;

  await prisma.rfq.update({
    where: { id: lead.id },
    data: next,
  });

  return { ...lead, ...next };
}

export async function GET(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const view = req.nextUrl.searchParams.get("view");

  const payload =
    view === "drawer" ? await getDrawerLead(id) : await getFullLead(id);

  if (!payload) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await repairCustomerIdentityFromBody(payload));
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { id } = await params;

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.rfq.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const d = parsed.data;

  if (d.assignedToUserId !== undefined) {
    await assignLead({
      rfqId: id,
      toUserId: d.assignedToUserId,
      actorId: session?.user?.id,
      reason: "Manual assignment",
    });
  }

  const updated = await prisma.rfq.update({
    where: { id },
    data: {
      ...(d.customerName !== undefined ? { customerName: d.customerName } : {}),
      ...(d.customerCompany !== undefined
        ? { customerCompany: d.customerCompany }
        : {}),
      ...(d.customerEmail !== undefined ? { customerEmail: d.customerEmail } : {}),
      ...(d.customerPhone !== undefined ? { customerPhone: d.customerPhone } : {}),
      ...(d.subject !== undefined ? { subject: d.subject } : {}),
      ...(d.rawText !== undefined ? { rawText: d.rawText } : {}),
      ...(d.category !== undefined ? { category: d.category } : {}),
      ...(d.priority !== undefined ? { priority: d.priority } : {}),
      ...(d.stageDetail !== undefined ? { stageDetail: d.stageDetail } : {}),
      ...(d.expectedValue !== undefined
        ? { expectedValue: d.expectedValue }
        : {}),
      ...(d.expectedClosureAt !== undefined
        ? {
            expectedClosureAt: d.expectedClosureAt
              ? new Date(d.expectedClosureAt)
              : null,
          }
        : {}),
      ...(d.referralSource !== undefined
        ? { referralSource: d.referralSource }
        : {}),
      ...(d.partyId !== undefined ? { partyId: d.partyId } : {}),
      ...(d.organisationId !== undefined
        ? { organisationId: d.organisationId }
        : {}),
      ...(d.archived !== undefined
        ? { archivedAt: d.archived ? new Date() : null }
        : {}),
    },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  if (d.note?.trim()) {
    await logLeadActivity({
      rfqId: id,
      type: "NOTE",
      title: "Note added",
      body: d.note.trim(),
      actorId: session?.user?.id,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { id } = await params;

  const existing = await prisma.rfq.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.rfq.update({
    where: { id },
    data: { archivedAt: new Date() },
  });

  await logLeadActivity({
    rfqId: id,
    type: "OTHER",
    title: "Lead archived",
    actorId: session?.user?.id,
  });

  return NextResponse.json(updated);
}
