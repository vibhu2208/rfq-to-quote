import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { createRfqWithMessage } from "@/lib/rfq";
import {
  assertAllowedDocument,
  extractQuoteFieldsFromDocument,
  extractTextFromDocument,
  REDUCTO_MAX_BYTES,
} from "@/lib/reducto";

function formString(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function filenameFromFile(file: File): string {
  const name = (file.name || "").trim();
  if (name && name.includes(".")) return name;
  const type = file.type || "";
  const byType: Record<string, string> = {
    "image/png": "pasted-screenshot.png",
    "image/jpeg": "pasted-screenshot.jpg",
    "image/jpg": "pasted-screenshot.jpg",
    "image/webp": "pasted-screenshot.webp",
    "image/gif": "pasted-screenshot.gif",
    "image/heic": "pasted-screenshot.heic",
    "image/heif": "pasted-screenshot.heic",
    "image/tiff": "pasted-screenshot.tiff",
    "image/bmp": "pasted-screenshot.bmp",
    "application/pdf": "document.pdf",
  };
  return byType[type] || name || "pasted-screenshot.png";
}

/**
 * Screenshot / document → OCR + extract line items → RFQ on the suggested
 * product / vendor page (same as typed capture). Does not auto-create a quote.
 */
export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const filename = filenameFromFile(file);
    if (file.size > REDUCTO_MAX_BYTES) {
      return NextResponse.json(
        { error: `File is too large (max ${REDUCTO_MAX_BYTES / (1024 * 1024)}MB)` },
        { status: 400 }
      );
    }

    try {
      assertAllowedDocument(filename, file.size);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid file";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    let company = formString(form, "company");
    let contactName = formString(form, "contactName");
    let email = formString(form, "email");
    let phone = formString(form, "phone");
    const partyId = formString(form, "partyId");
    const subject = formString(form, "subject");
    const notes = formString(form, "notes");
    const pasted = formString(form, "text") || formString(form, "productNeeded");

    const buffer = Buffer.from(await file.arrayBuffer());
    let ocrText = "";
    try {
      const extracted = await extractTextFromDocument(buffer, filename);
      ocrText = extracted.text;
    } catch (e) {
      if (!pasted) throw e;
    }

    let extractedItems: Array<{
      description: string;
      productName: string;
      model: string;
      quantity: number;
      unit: string;
    }> = [];

    try {
      const { fields } = await extractQuoteFieldsFromDocument(buffer, filename);
      company = company || fields.company;
      contactName = contactName || fields.contactName;
      extractedItems = fields.lineItems
        .map((l) => ({
          description: [l.productName, l.model].filter(Boolean).join(" "),
          productName: l.productName,
          model: l.model,
          quantity: l.quantity > 0 ? l.quantity : 1,
          unit: l.unit || "pcs",
        }))
        .filter((l) => l.description);
    } catch {
      // OCR text is enough to create the requirement
    }

    const itemLines =
      extractedItems.length > 0
        ? [
            "Extracted items:",
            ...extractedItems.map(
              (l) => `• ${l.description} – ${l.quantity} ${l.unit}`
            ),
          ].join("\n")
        : "";

    const rawText = [
      pasted || null,
      `Document: ${filename}`,
      "(Captured from document/photo)",
      contactName ? `Contact: ${contactName}` : null,
      company ? `Company: ${company}` : null,
      email ? `Email: ${email}` : null,
      phone ? `Phone: ${phone}` : null,
      notes ? `Notes: ${notes}` : null,
      "---",
      ocrText || null,
      itemLines || null,
    ]
      .filter(Boolean)
      .join("\n");

    if (!ocrText.trim() && !pasted && extractedItems.length === 0) {
      return NextResponse.json(
        { error: "Could not read any requirement from this screenshot or document" },
        { status: 400 }
      );
    }

    const party = partyId
      ? await prisma.party.findFirst({
          where: { id: partyId, active: true, type: { not: "OTHER" } },
        })
      : company
        ? await prisma.party.findFirst({
            where: {
              active: true,
              type: { not: "OTHER" },
              OR: [
                { legalName: { contains: company, mode: "insensitive" } },
                { tradeName: { contains: company, mode: "insensitive" } },
              ],
            },
          })
        : null;

    if (party) {
      company = company || party.legalName;
      contactName = contactName || party.managedByName || party.legalName;
      email = email || party.email || "";
      phone = phone || party.phone || "";
    }

    const resolvedSubject =
      subject ||
      `Document RFQ: ${filename}${company ? ` — ${company}` : ""}`;

    let rfq = await createRfqWithMessage({
      channel: "MANUAL",
      sourceRef: `doc-${Date.now()}-${filename.slice(0, 40)}`,
      subject: resolvedSubject,
      rawText,
      rawAttachments: [
        {
          name: filename,
          contentType: file.type || undefined,
        },
      ],
      customerName: contactName || "",
      customerEmail: email || "",
      customerPhone: phone || "",
      customerCompany: company || "",
    });

    if (extractedItems.length > 0) {
      const existing =
        rfq.parsedSpecs && typeof rfq.parsedSpecs === "object"
          ? (rfq.parsedSpecs as Record<string, unknown>)
          : {};
      const existingItems = Array.isArray(existing.items) ? existing.items : [];
      rfq = await prisma.rfq.update({
        where: { id: rfq.id },
        data: {
          parsedSpecs: {
            ...existing,
            items: existingItems.length >= extractedItems.length ? existingItems : extractedItems,
          } as Prisma.InputJsonValue,
        },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    }

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
    const message = e instanceof Error ? e.message : "Failed to create RFQ from document";
    const status =
      message.includes("REDUCTO_API_KEY") || message.includes("not configured")
        ? 503
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
