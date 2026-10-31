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
import { isQuoteSpreadsheet, parseQuoteSpreadsheet } from "@/lib/quote-csv";

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
    "text/csv": "requirement.csv",
    "application/vnd.ms-excel": "requirement.xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "requirement.xlsx",
  };
  return byType[type] || name || "pasted-screenshot.png";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

    const spreadsheet = isQuoteSpreadsheet(filename, file.type);
    if (!spreadsheet) {
      try {
        assertAllowedDocument(filename, file.size);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Invalid file";
        return NextResponse.json({ error: message }, { status: 400 });
      }
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
    let extractedItems: Array<{
      description: string;
      productName: string;
      model: string;
      brand: string;
      code: string;
      extraNotes: string;
      quantity: number;
      unit: string;
    }> = [];

    if (spreadsheet) {
      const parsed = parseQuoteSpreadsheet(buffer, filename);
      company = company || parsed.company;
      extractedItems = parsed.items.map((item) => ({
        description: item.productName || item.code,
        productName: item.productName,
        model: item.model,
        brand: item.brand,
        code: item.code,
        extraNotes: item.extraNotes,
        quantity: item.quantity > 0 ? item.quantity : 1,
        unit: item.unit,
      }));
      ocrText = extractedItems
        .map(
          (l) =>
            `• ${l.description}${l.code ? ` [${l.code}]` : ""} – ${l.quantity} ${l.unit}`
        )
        .join("\n");
      if (extractedItems.length === 0) {
        return NextResponse.json(
          {
            error:
              "No product rows found in this spreadsheet. Include columns like Product, SKU, and Qty.",
          },
          { status: 400 }
        );
      }
    } else {
      try {
        const extracted = await extractTextFromDocument(buffer, filename);
        ocrText = extracted.text;
      } catch (e) {
        if (!pasted) throw e;
      }

      try {
        const { fields } = await extractQuoteFieldsFromDocument(buffer, filename);
        company = company || fields.company;
        contactName = contactName || fields.contactName;
        extractedItems = fields.lineItems
          .map((l) => ({
            description: l.productName,
            productName: l.productName,
            model: l.model,
            brand: l.brand,
            code: l.code,
            extraNotes: l.extraNotes,
            quantity: l.quantity > 0 ? l.quantity : 1,
            unit: l.unit,
          }))
          .filter((l) => l.productName);
      } catch {
        // OCR text is enough to create the requirement
      }
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
      spreadsheet ? "(Imported from spreadsheet)" : "(Captured from document/photo)",
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
      autoParse: spreadsheet ? false : undefined,
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
            items:
              spreadsheet || existingItems.length < extractedItems.length
                ? extractedItems
                : existingItems,
            ...(spreadsheet
              ? {
                  _meta: {
                    summary: `${extractedItems.length} line${extractedItems.length === 1 ? "" : "s"} imported from spreadsheet`,
                    itemCount: extractedItems.length,
                  },
                }
              : {}),
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
