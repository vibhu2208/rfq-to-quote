import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma, TelemarketingCallStatus } from "@prisma/client";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { logTelemarketingTimeline } from "@/lib/telemarketing/timeline";
import { parseTagsJson } from "@/lib/telemarketing/contact-update";

const listSelect = {
  id: true,
  name: true,
  company: true,
  role: true,
  phone: true,
  email: true,
  source: true,
  callStatus: true,
  tags: true,
  assignedToUserId: true,
  convertedLeadId: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: { select: { id: true, name: true, email: true } },
  _count: { select: { reminders: true, calls: true, alternatives: true } },
};

function buildWhere(params: URLSearchParams): Prisma.TelemarketingContactWhereInput {
  const q = params.get("q")?.trim();
  const status = params.get("status") as TelemarketingCallStatus | "ALL" | null;
  const source = params.get("source");
  const view = params.get("view") || "active";
  const assignee = params.get("assignee");
  const tag = params.get("tag")?.trim().toLowerCase();
  const primaryContactId = params.get("primaryContactId");

  if (primaryContactId) {
    return { primaryContactId, archivedAt: null };
  }

  const where: Prisma.TelemarketingContactWhereInput = {
    primaryContactId: null,
  };

  if (view === "archived") {
    where.archivedAt = { not: null };
  } else {
    where.archivedAt = null;
  }

  if (source === "MANUAL" || source === "IMPORTED") {
    where.source = source;
  }

  if (status && status !== "ALL") {
    where.callStatus = status;
  }

  if (assignee === "unassigned") {
    where.assignedToUserId = null;
  } else if (assignee) {
    where.assignedToUserId = assignee;
  }

  if (tag) {
    where.tags = { string_contains: tag };
  }

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { email: { contains: q, mode: "insensitive" } },
      { role: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const where = buildWhere(searchParams);
  const take = Math.min(Number(searchParams.get("take") || 50) || 50, 200);
  const skip = Math.max(Number(searchParams.get("skip") || 0) || 0, 0);
  const sort = searchParams.get("sort") === "asc" ? "asc" : "desc";

  const baseWhere: Prisma.TelemarketingContactWhereInput = {
    archivedAt: where.archivedAt,
    primaryContactId: null,
  };

  const [items, total, statusGroups, dueReminders] = await Promise.all([
    prisma.telemarketingContact.findMany({
      where,
      orderBy: { createdAt: sort },
      take,
      skip,
      select: {
        ...listSelect,
        reminders: {
          where: {
            status: "PENDING",
            dueAt: { lte: new Date() },
          },
          take: 3,
          orderBy: { dueAt: "asc" },
          select: { id: true, type: true, dueAt: true, notes: true },
        },
      },
    }),
    prisma.telemarketingContact.count({ where }),
    prisma.telemarketingContact.groupBy({
      by: ["callStatus"],
      where: baseWhere,
      _count: { _all: true },
    }),
    prisma.telemarketingReminder.findMany({
      where: {
        status: "PENDING",
        dueAt: { lte: new Date() },
        contact: { archivedAt: null },
      },
      take: 20,
      orderBy: { dueAt: "asc" },
      include: {
        contact: { select: { id: true, name: true, company: true, phone: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    }),
  ]);

  const statusCounts: Record<string, number> = { ALL: 0 };
  for (const row of statusGroups) {
    statusCounts[row.callStatus] = row._count._all;
    statusCounts.ALL += row._count._all;
  }

  const normalized = items.map((row) => ({
    ...row,
    tags: parseTagsJson(row.tags as unknown),
  }));

  return NextResponse.json({
    items: normalized,
    total,
    statusCounts,
    dueReminders,
    skip,
    take,
    hasMore: skip + items.length < total,
  });
}

const createSchema = z.object({
  contacts: z
    .array(
      z.object({
        name: z.string().optional().default(""),
        company: z.string().optional().default(""),
        role: z.string().optional().default(""),
        phone: z.string().optional().default(""),
        email: z.string().optional().default(""),
        assignedToUserId: z.string().nullable().optional(),
      })
    )
    .min(1),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const createdIds: string[] = [];
  const errors: { index: number; error: string }[] = [];

  for (let i = 0; i < parsed.data.contacts.length; i++) {
    const row = parsed.data.contacts[i];
    const phone = row.phone.trim();
    const email = row.email.trim();
    if (!phone && !email) {
      errors.push({ index: i, error: "Phone or email required" });
      continue;
    }

    const contact = await prisma.telemarketingContact.create({
      data: {
        name: row.name || "",
        company: row.company || "",
        role: row.role || "",
        phone,
        email,
        source: "MANUAL",
        assignedToUserId: row.assignedToUserId || null,
      },
    });
    createdIds.push(contact.id);

    await logTelemarketingTimeline({
      contactId: contact.id,
      type: "CONTACT_CREATED",
      title: "Contact created",
      body: "Added manually",
      actorId: session?.user?.id,
    });
  }

  return NextResponse.json({ createdIds, errors });
}