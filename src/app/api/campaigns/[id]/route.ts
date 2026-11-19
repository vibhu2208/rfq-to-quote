import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      recipients: {
        orderBy: { createdAt: "asc" },
        take: 500,
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ campaign });
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  messageBody: z.string().min(1).optional(),
  launchMode: z.enum(["INSTANT", "SCHEDULED"]).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  recipientMode: z.enum(["TELEMARKETING", "LEADS", "CSV"]).optional(),
  recipientFilter: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["DRAFT", "SCHEDULED", "CANCELLED", "PAUSED"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await params;

  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!["DRAFT", "SCHEDULED", "PAUSED"].includes(existing.status)) {
    return NextResponse.json(
      { error: "Only draft or scheduled campaigns can be edited" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      name: parsed.data.name,
      messageBody: parsed.data.messageBody,
      launchMode: parsed.data.launchMode,
      scheduledAt:
        parsed.data.scheduledAt === null
          ? null
          : parsed.data.scheduledAt
            ? new Date(parsed.data.scheduledAt)
            : undefined,
      recipientMode: parsed.data.recipientMode,
      recipientFilter: parsed.data.recipientFilter as Prisma.InputJsonValue | undefined,
      status: parsed.data.status,
    },
  });

  return NextResponse.json({ campaign });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await params;

  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.status !== "DRAFT") {
    return NextResponse.json({ error: "Only drafts can be deleted" }, { status: 400 });
  }

  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}