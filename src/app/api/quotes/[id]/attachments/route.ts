import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import {
  filenameFromUpload,
  QUOTE_ATTACHMENT_MAX_BYTES,
  type QuoteAttachmentMeta,
} from "@/lib/quote-attachments";
import { uploadQuoteAttachmentFile } from "@/lib/supabase-storage";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

function meta(row: {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  note: string;
  createdAt: Date;
}): QuoteAttachmentMeta {
  return {
    id: row.id,
    fileName: row.fileName,
    contentType: row.contentType,
    size: row.size,
    note: row.note,
    hasFile: row.size > 0,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const quote = await prisma.quote.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.quoteAttachment.findMany({
    where: { quoteId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      contentType: true,
      size: true,
      note: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ attachments: rows.map(meta) });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const quote = await prisma.quote.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contentType = req.headers.get("content-type") || "";
  let note = "";
  let file: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const noteField = form.get("note");
    note = typeof noteField === "string" ? noteField.trim() : "";
    const uploaded = form.get("file");
    if (uploaded instanceof File && uploaded.size > 0) file = uploaded;
  } else {
    const body = (await req.json().catch(() => ({}))) as { note?: string };
    note = typeof body.note === "string" ? body.note.trim() : "";
  }

  if (!file && !note) {
    return NextResponse.json(
      { error: "Add a note, paste a screenshot, or choose a file" },
      { status: 400 }
    );
  }

  if (file && file.size > QUOTE_ATTACHMENT_MAX_BYTES) {
    return NextResponse.json(
      { error: `File is too large (max ${QUOTE_ATTACHMENT_MAX_BYTES / (1024 * 1024)}MB)` },
      { status: 400 }
    );
  }

  const buffer = file ? Buffer.from(await file.arrayBuffer()) : null;
  const created = await prisma.quoteAttachment.create({
    data: {
      quoteId: id,
      fileName: file ? filenameFromUpload(file) : "note.txt",
      contentType: file?.type || (note ? "text/plain" : "application/octet-stream"),
      size: buffer?.byteLength ?? 0,
      note,
      data: buffer,
    },
    select: {
      id: true,
      fileName: true,
      contentType: true,
      size: true,
      note: true,
      createdAt: true,
    },
  });

  if (buffer) {
    try {
      const storageKey = await uploadQuoteAttachmentFile({
        quoteId: id,
        attachmentId: created.id,
        fileName: created.fileName,
        contentType: created.contentType,
        body: buffer,
      });
      if (storageKey) {
        await prisma.$executeRaw`
          UPDATE "QuoteAttachment" SET "storageKey" = ${storageKey} WHERE id = ${created.id}
        `;
      }
    } catch (e) {
      console.warn("Supabase Storage upload skipped", e);
    }
  }

  return NextResponse.json(meta(created), { status: 201 });
}
