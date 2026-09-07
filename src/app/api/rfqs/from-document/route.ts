import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { createRfqWithMessage } from "@/lib/rfq";
import {
  assertAllowedDocument,
  extractTextFromDocument,
  REDUCTO_MAX_BYTES,
} from "@/lib/reducto";

function formString(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Create an RFQ from an uploaded document or photo (Reducto OCR → existing AI parse).
 */
export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const filename = file.name || "document.pdf";
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

    const company = formString(form, "company");
    const contactName = formString(form, "contactName");
    const email = formString(form, "email");
    const phone = formString(form, "phone");
    const subject = formString(form, "subject");
    const notes = formString(form, "notes");

    const buffer = Buffer.from(await file.arrayBuffer());
    const { text: ocrText } = await extractTextFromDocument(buffer, filename);

    const rawText = [
      `Document: ${filename}`,
      "(Captured from document/photo via Reducto)",
      contactName ? `Contact: ${contactName}` : null,
      company ? `Company: ${company}` : null,
      email ? `Email: ${email}` : null,
      phone ? `Phone: ${phone}` : null,
      notes ? `Notes: ${notes}` : null,
      "---",
      ocrText,
    ]
      .filter(Boolean)
      .join("\n");

    const resolvedSubject =
      subject ||
      `Document RFQ: ${filename}${company ? ` — ${company}` : ""}`;

    const rfq = await createRfqWithMessage({
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
