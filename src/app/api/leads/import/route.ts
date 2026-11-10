import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { requireSession } from "@/lib/api";
import { findDuplicateLeads } from "@/lib/leads/duplicates";
import { createRfqWithMessage } from "@/lib/rfq";
import { prisma } from "@/lib/prisma";
import type { LeadPriority, RfqChannel } from "@prisma/client";

type Row = Record<string, string>;

function pick(row: Row, keys: string[]) {
  for (const key of keys) {
    const found = Object.entries(row).find(
      ([k]) => k.trim().toLowerCase() === key.toLowerCase()
    );
    if (found?.[1]?.trim()) return found[1].trim();
  }
  return "";
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = Papa.parse<Row>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length) {
    return NextResponse.json(
      { error: "CSV parse failed", details: parsed.errors.slice(0, 5) },
      { status: 400 }
    );
  }

  const created: string[] = [];
  const errors: { row: number; error: string; data?: Row }[] = [];
  const duplicates: { row: number; leadNumbers: string[] }[] = [];

  let rowIndex = 1;
  for (const row of parsed.data) {
    rowIndex += 1;
    try {
      const customerName = pick(row, ["contact", "contact person", "name", "customer name"]);
      const customerCompany = pick(row, ["company", "lead name", "customer company"]);
      const customerEmail = pick(row, ["email", "e-mail"]);
      const customerPhone = pick(row, ["phone", "mobile", "telephone"]);
      const requirement = pick(row, ["requirement", "notes", "subject", "product"]);
      const category = pick(row, ["category", "product category"]);
      const referralSource = pick(row, ["referral", "referral source", "source detail"]);
      const priorityRaw = pick(row, ["priority"]).toUpperCase();
      const priority = (
        ["HOT", "HIGH", "MEDIUM", "LOW"].includes(priorityRaw)
          ? priorityRaw
          : "MEDIUM"
      ) as LeadPriority;

      if (!customerName && !customerCompany) {
        errors.push({ row: rowIndex, error: "Missing contact/company", data: row });
        continue;
      }
      if (!requirement) {
        errors.push({ row: rowIndex, error: "Missing requirement", data: row });
        continue;
      }

      const dupes = await findDuplicateLeads({
        email: customerEmail,
        phone: customerPhone,
        company: customerCompany,
      });
      if (dupes.length) {
        duplicates.push({
          row: rowIndex,
          leadNumbers: dupes.map((d) => d.leadNumber),
        });
        continue;
      }

      const channel: RfqChannel = "IMPORT";
      const rfq = await createRfqWithMessage({
        channel,
        sourceRef: `import-${Date.now()}-${rowIndex}`,
        subject: requirement.slice(0, 120),
        rawText: requirement,
        customerName: customerName || customerCompany,
        customerCompany,
        customerEmail,
        customerPhone,
        autoParse: false,
      });

      await prisma.rfq.update({
        where: { id: rfq.id },
        data: {
          category,
          priority,
          referralSource,
        },
      });

      created.push(rfq.id);
    } catch (e) {
      errors.push({
        row: rowIndex,
        error: e instanceof Error ? e.message : "Import failed",
        data: row,
      });
    }
  }

  return NextResponse.json({
    created: created.length,
    createdIds: created,
    duplicates,
    errors,
    importedBy: session?.user?.email || null,
  });
}
