import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { generateQuoteFromRequirement } from "@/lib/quote-generate";
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
    "image/png": "pasted-photo.png",
    "image/jpeg": "pasted-photo.jpg",
    "image/jpg": "pasted-photo.jpg",
    "image/webp": "pasted-photo.webp",
    "image/gif": "pasted-photo.gif",
    "image/heic": "pasted-photo.heic",
    "image/heif": "pasted-photo.heic",
    "image/tiff": "pasted-photo.tiff",
    "image/bmp": "pasted-photo.bmp",
    "application/pdf": "document.pdf",
    "application/msword": "document.doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "document.docx",
    "text/plain": "requirement.txt",
    "application/rtf": "document.rtf",
    "text/rtf": "document.rtf",
  };
  return byType[type] || name || "document.pdf";
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const contentType = req.headers.get("content-type") || "";
    let rawText = "";
    let subject = "";
    let company = "";
    let contactName = "";
    let email = "";
    let phone = "";
    let filename = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      company = formString(form, "company");
      contactName = formString(form, "contactName");
      email = formString(form, "email");
      phone = formString(form, "phone");
      subject = formString(form, "subject");
      const pasted = formString(form, "text") || formString(form, "productNeeded");
      const file = form.get("file");

      if (file instanceof File && file.size > 0) {
        filename = filenameFromFile(file);
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
        const buffer = Buffer.from(await file.arrayBuffer());
        let ocrText = "";
        try {
          const extracted = await extractTextFromDocument(buffer, filename);
          ocrText = extracted.text;
        } catch (e) {
          if (!pasted) throw e;
        }
        let extractedSummary = "";
        try {
          const { fields } = await extractQuoteFieldsFromDocument(buffer, filename);
          company = company || fields.company;
          contactName = contactName || fields.contactName;
          if (fields.lineItems.length > 0) {
            extractedSummary = [
              "Extracted items:",
              ...fields.lineItems.map((l) =>
                [
                  l.productName,
                  l.model ? `model ${l.model}` : null,
                  l.quantity ? `qty ${l.quantity} ${l.unit || "pcs"}` : null,
                  l.unitPrice ? `@ ${l.unitPrice}` : null,
                ]
                  .filter(Boolean)
                  .join(" — ")
              ),
            ].join("\n");
          }
        } catch {
          // OCR text is enough to create the requirement
        }
        rawText = [
          pasted || null,
          ocrText || extractedSummary
            ? `Document: ${filename}\n(Captured from document/photo)`
            : null,
          ocrText || null,
          extractedSummary || null,
        ]
          .filter(Boolean)
          .join("\n\n");
      } else {
        rawText = pasted;
      }
    } else {
      const body = (await req.json()) as Record<string, unknown>;
      rawText = String(body.text || body.productNeeded || "").trim();
      subject = String(body.subject || "").trim();
      company = String(body.company || "").trim();
      contactName = String(body.contactName || "").trim();
      email = String(body.email || "").trim();
      phone = String(body.phone || "").trim();
    }

    if (!rawText.trim()) {
      return NextResponse.json(
        { error: "Paste a requirement or upload a photo, PDF, or document" },
        { status: 400 }
      );
    }

    const { quote, rfqId } = await generateQuoteFromRequirement({
      rawText,
      subject,
      company,
      contactName,
      email,
      phone,
      filename: filename || undefined,
    });

    return NextResponse.json(
      {
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        rfqId,
      },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate quote";
    const status =
      message.includes("REDUCTO_API_KEY") || message.includes("not configured")
        ? 503
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
