import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildCampaignRecipients, type CsvRecipientRow } from "@/lib/campaigns/recipients";
import { pickMappedColumn, type ImportRow } from "@/lib/telemarketing/import";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  mode: z.enum(["TELEMARKETING", "LEADS", "CSV"]),
  selectedIds: z.array(z.string()).optional(),
  csvRows: z
    .array(
      z.object({
        phone: z.string(),
        name: z.string().optional(),
        company: z.string().optional(),
        email: z.string().optional(),
      })
    )
    .optional(),
  mapping: z
    .object({
      phone: z.string().optional(),
      name: z.string().optional(),
      company: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
  rows: z.array(z.record(z.string(), z.string())).optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;
  const { id: campaignId } = await params;

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!["DRAFT", "SCHEDULED", "PAUSED"].includes(campaign.status)) {
    return NextResponse.json({ error: "Campaign is not editable" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let csvRows: CsvRecipientRow[] = parsed.data.csvRows || [];
  if (parsed.data.rows?.length && parsed.data.mapping) {
    csvRows = parsed.data.rows
      .map((row: ImportRow) => ({
        phone: pickMappedColumn(row, parsed.data.mapping?.phone),
        name: pickMappedColumn(row, parsed.data.mapping?.name),
        company: pickMappedColumn(row, parsed.data.mapping?.company),
        email: pickMappedColumn(row, parsed.data.mapping?.email),
      }))
      .filter((r) => r.phone);
  }

  const telemarketingContacts =
    parsed.data.mode === "TELEMARKETING"
      ? await prisma.telemarketingContact.findMany({
          where: {
            archivedAt: null,
            phone: { not: "" },
            ...(parsed.data.selectedIds?.length
              ? { id: { in: parsed.data.selectedIds } }
              : {}),
          },
          select: { id: true, phone: true, name: true, company: true, email: true },
          take: 5000,
        })
      : [];

  const leads =
    parsed.data.mode === "LEADS"
      ? await prisma.rfq.findMany({
          where: {
            archivedAt: null,
            intakeKind: "REQUIREMENT",
            customerPhone: { not: "" },
            ...(parsed.data.selectedIds?.length
              ? { id: { in: parsed.data.selectedIds } }
              : {}),
          },
          select: {
            id: true,
            customerPhone: true,
            customerName: true,
            customerCompany: true,
            customerEmail: true,
          },
          take: 5000,
        })
      : [];

  const built = buildCampaignRecipients({
    mode: parsed.data.mode,
    messageTemplate: campaign.messageBody,
    telemarketingContacts,
    leads,
    csvRows,
    selectedIds: parsed.data.selectedIds,
  });

  await prisma.$transaction(async (tx) => {
    await tx.campaignRecipient.deleteMany({ where: { campaignId } });
    if (built.length) {
      await tx.campaignRecipient.createMany({
        data: built.map((row) => ({
          campaignId,
          phone: row.phone,
          name: row.name || "",
          company: row.company || "",
          email: row.email || "",
          messageBody: row.messageBody,
          sourceRef: row.sourceRef || "",
          contactId: row.contactId || null,
          rfqId: row.rfqId || null,
          status: "PENDING" as const,
        })),
      });
    }
    await tx.campaign.update({
      where: { id: campaignId },
      data: {
        recipientMode: parsed.data.mode,
        recipientFilter: {
          selectedIds: parsed.data.selectedIds || [],
        },
        totalRecipients: built.length,
        pendingCount: built.length,
        queuedCount: 0,
        deliveredCount: 0,
        failedCount: 0,
      },
    });
  });

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId },
    take: 500,
  });

  return NextResponse.json({ count: built.length, recipients });
}