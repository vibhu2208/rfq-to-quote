import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { CampaignStatus, Prisma } from "@prisma/client";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

function buildWhere(params: URLSearchParams): Prisma.CampaignWhereInput {
  const q = params.get("q")?.trim();
  const status = params.get("status") as CampaignStatus | "ALL" | null;
  const where: Prisma.CampaignWhereInput = {};
  if (status && status !== "ALL") where.status = status;
  if (q) where.name = { contains: q, mode: "insensitive" };
  return where;
}

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const where = buildWhere(searchParams);

  const [items, summary] = await Promise.all([
    prisma.campaign.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.campaign.aggregate({
      _count: { _all: true },
      _sum: {
        totalRecipients: true,
        deliveredCount: true,
        replyCount: true,
      },
    }),
  ]);

  const delivered = await prisma.campaignRecipient.count({
    where: {
      status: { in: ["SENT", "DELIVERED", "READ", "QUEUED"] },
    },
  });

  return NextResponse.json({
    items,
    summary: {
      totalCampaigns: summary._count._all,
      totalRecipients: summary._sum.totalRecipients || 0,
      delivered,
      replies: summary._sum.replyCount || 0,
    },
  });
}

const createSchema = z.object({
  name: z.string().min(1),
  messageBody: z.string().min(1),
  launchMode: z.enum(["INSTANT", "SCHEDULED"]).default("INSTANT"),
  scheduledAt: z.string().datetime().optional().nullable(),
  recipientMode: z.enum(["TELEMARKETING", "LEADS", "CSV"]).default("CSV"),
  recipientFilter: z.record(z.string(), z.unknown()).optional(),
  saveAsScheduled: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const status =
    parsed.data.saveAsScheduled || parsed.data.launchMode === "SCHEDULED"
      ? "SCHEDULED"
      : "DRAFT";

  const campaign = await prisma.campaign.create({
    data: {
      name: parsed.data.name,
      messageBody: parsed.data.messageBody,
      launchMode: parsed.data.launchMode,
      scheduledAt: parsed.data.scheduledAt
        ? new Date(parsed.data.scheduledAt)
        : null,
      recipientMode: parsed.data.recipientMode,
      recipientFilter: (parsed.data.recipientFilter ?? {}) as Prisma.InputJsonValue,
      status,
      createdById: session?.user?.id || null,
    },
  });

  return NextResponse.json({ campaign });
}