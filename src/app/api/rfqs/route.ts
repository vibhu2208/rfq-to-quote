import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { createRfqWithMessage } from "@/lib/rfq";
import type { RfqChannel, RfqStatus } from "@prisma/client";

const CHANNELS = new Set([
  "MANUAL",
  "EMAIL",
  "WEB_FORM",
  "MARKETPLACE",
  "WHATSAPP",
]);
const STATUSES = new Set([
  "NEW",
  "NEEDS_REVIEW",
  "PARSED",
  "QUOTED",
  "CLOSED",
]);

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const channelParam = searchParams.get("channel") || "";
  const statusParam = searchParams.get("status") || "";
  const q = searchParams.get("q")?.trim() || "";
  const channel =
    channelParam && CHANNELS.has(channelParam)
      ? (channelParam as RfqChannel)
      : null;
  const status =
    statusParam && STATUSES.has(statusParam)
      ? (statusParam as RfqStatus)
      : null;

  const where = {
    AND: [
      channel ? { channel } : {},
      status ? { status } : {},
      q
        ? {
            OR: [
              { customerName: { contains: q, mode: "insensitive" as const } },
              { customerEmail: { contains: q, mode: "insensitive" as const } },
              { customerCompany: { contains: q, mode: "insensitive" as const } },
              { subject: { contains: q, mode: "insensitive" as const } },
              { parsedCategory: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {},
    ],
  };

  const [rfqs, statusGroups, total] = await Promise.all([
    prisma.rfq.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        channel: true,
        subject: true,
        customerName: true,
        customerEmail: true,
        customerCompany: true,
        status: true,
        parsedCategory: true,
        parseConfidence: true,
        createdAt: true,
        _count: { select: { messages: true, quotes: true } },
      },
    }),
    prisma.rfq.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.rfq.count({ where }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of statusGroups) {
    counts[row.status] = row._count._all;
  }

  return NextResponse.json({
    items: rfqs,
    total,
    counts,
  });
}

const createSchema = z.object({
  company: z.string().optional().default(""),
  contactName: z.string().min(1, "Contact name is required"),
  email: z.union([z.string().email(), z.literal("")]).optional().default(""),
  phone: z.string().optional().default(""),
  productNeeded: z.string().min(1, "Describe what the client needs"),
  quantity: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  subject: z.string().optional().default(""),
});

/** Team capture — authenticated MANUAL RFQ (live client / desk intake). */
export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const d = parsed.data;
    const rawText = [
      `Product / service needed: ${d.productNeeded}`,
      d.quantity ? `Quantity: ${d.quantity}` : null,
      d.notes ? `Notes: ${d.notes}` : null,
      `Contact: ${d.contactName}`,
      d.company ? `Company: ${d.company}` : null,
      d.email ? `Email: ${d.email}` : null,
      d.phone ? `Phone: ${d.phone}` : null,
      "(Captured by team — MANUAL)",
    ]
      .filter(Boolean)
      .join("\n");

    const subject =
      d.subject.trim() ||
      `Team RFQ: ${d.productNeeded.slice(0, 80)}${d.company ? ` — ${d.company}` : ""}`;

    const rfq = await createRfqWithMessage({
      channel: "MANUAL",
      sourceRef: `manual-${Date.now()}`,
      subject,
      rawText,
      customerName: d.contactName,
      customerEmail: d.email || "",
      customerPhone: d.phone || "",
      customerCompany: d.company || "",
    });

    return NextResponse.json(
      {
        id: rfq.id,
        status: rfq.status,
        parsedCategory: rfq.parsedCategory,
        parseConfidence: rfq.parseConfidence,
      },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create RFQ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
