import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { mapRowToContact, type ImportRow } from "@/lib/telemarketing/import";
import { logTelemarketingTimeline } from "@/lib/telemarketing/timeline";

const importSchema = z.object({
  rows: z.array(z.record(z.string(), z.string())).optional(),
  mapping: z.object({
    name: z.string().optional(),
    company: z.string().optional(),
    role: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
  }),
  assignedToUserId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;

  const contentType = req.headers.get("content-type") || "";

  let rows: ImportRow[] = [];
  let mapping: z.infer<typeof importSchema>["mapping"] = {};
  let assignedToUserId: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const mappingRaw = form.get("mapping");
    const assignee = form.get("assignedToUserId");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const text = await file.text();
    const parsed = Papa.parse<ImportRow>(text, { header: true, skipEmptyLines: true });
    if (parsed.errors.length) {
      return NextResponse.json(
        { error: "CSV parse failed", details: parsed.errors.slice(0, 5) },
        { status: 400 }
      );
    }
    rows = parsed.data;
    if (typeof mappingRaw === "string") {
      try {
        mapping = JSON.parse(mappingRaw);
      } catch {
        return NextResponse.json({ error: "Invalid mapping JSON" }, { status: 400 });
      }
    }
    assignedToUserId = typeof assignee === "string" && assignee ? assignee : null;
  } else {
    const body = await req.json();
    const parsed = importSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    rows = parsed.data.rows || [];
    mapping = parsed.data.mapping;
    assignedToUserId = parsed.data.assignedToUserId ?? null;
  }

  const created: string[] = [];
  const errors: { row: number; error: string }[] = [];

  let rowIndex = 1;
  for (const row of rows) {
    rowIndex += 1;
    const mapped = mapRowToContact(row, mapping);
    if (!mapped.ok) {
      errors.push({ row: rowIndex, error: mapped.error });
      continue;
    }

    const contact = await prisma.telemarketingContact.create({
      data: {
        ...mapped.contact,
        source: "IMPORTED",
        assignedToUserId,
      },
    });
    created.push(contact.id);

    await logTelemarketingTimeline({
      contactId: contact.id,
      type: "CONTACT_IMPORTED",
      title: "Contact imported",
      body: "Imported from file",
      actorId: session?.user?.id,
    });
  }

  return NextResponse.json({ created, errors, total: rows.length });
}