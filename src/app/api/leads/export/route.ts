import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  buildLeadWhere,
  parseLeadFiltersFromSearchParams,
} from "@/lib/leads/filters";
import { LEAD_CHANNEL_LABELS, LEAD_STAGE_LABELS } from "@/lib/leads/constants";

function csvEscape(value: unknown) {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const filters = parseLeadFiltersFromSearchParams(
    searchParams,
    session?.user?.id
  );
  const where = buildLeadWhere(filters);

  const items = await prisma.rfq.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: {
      assignedTo: { select: { name: true, email: true } },
      quotes: {
        select: { quoteNumber: true, grandTotal: true, status: true },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const header = [
    "Lead ID",
    "Source",
    "Company",
    "Contact",
    "Phone",
    "Email",
    "Category",
    "Requirement",
    "Stage",
    "Priority",
    "Assigned To",
    "Expected Value",
    "Expected Closure",
    "Quote",
    "Created At",
  ];

  const lines = [
    header.join(","),
    ...items.map((r) =>
      [
        r.leadNumber,
        LEAD_CHANNEL_LABELS[r.channel] || r.channel,
        r.customerCompany,
        r.customerName,
        r.customerPhone,
        r.customerEmail,
        r.category || r.parsedCategory || "",
        r.subject || r.rawText.slice(0, 120),
        LEAD_STAGE_LABELS[r.leadStage],
        r.priority,
        r.assignedTo?.name || r.assignedTo?.email || "",
        r.expectedValue?.toString() || "",
        r.expectedClosureAt?.toISOString().slice(0, 10) || "",
        r.quotes[0]
          ? `${r.quotes[0].quoteNumber} (${r.quotes[0].status})`
          : "",
        r.createdAt.toISOString(),
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-export.csv"`,
    },
  });
}
