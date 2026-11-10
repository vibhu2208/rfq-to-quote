import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import {
  filenameFromUpload,
  formatAttachmentSize,
  QUOTE_ATTACHMENT_MAX_BYTES,
} from "@/lib/quote-attachments";
import { uploadLeadAttachmentFile } from "@/lib/supabase-storage";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

function meta(row: {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  note: string;
  createdAt: Date;
}) {
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
  const lead = await prisma.rfq.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.leadAttachment.findMany({
    where: { rfqId: id },
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

  return NextResponse.json({ documents: rows.map(meta) });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const lead = await prisma.rfq.findUnique({
    where: { id },
    select: { id: true, leadNumber: true },
  });
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Upload a file as multipart form data" },
      { status: 400 }
    );
  }

  const form = await req.formData();
  const noteField = form.get("note");
  const note = typeof noteField === "string" ? noteField.trim() : "";
  const uploaded = form.get("file");
  const file =
    uploaded instanceof File && uploaded.size > 0 ? uploaded : null;

  if (!file) {
    return NextResponse.json({ error: "Choose a document to upload" }, { status: 400 });
  }

  if (file.size > QUOTE_ATTACHMENT_MAX_BYTES) {
    return NextResponse.json(
      {
        error: `File is too large (max ${QUOTE_ATTACHMENT_MAX_BYTES / (1024 * 1024)}MB)`,
      },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const attachmentId = randomUUID();
  const fileName = filenameFromUpload(file);
  const fileType = file.type || "application/octet-stream";
  let storageKey: string | null = null;

  try {
    storageKey = await uploadLeadAttachmentFile({
      leadId: id,
      attachmentId,
      fileName,
      contentType: fileType,
      body: buffer,
    });
  } catch (e) {
    console.warn("Lead document storage upload skipped", e);
  }

  const created = await prisma.leadAttachment.create({
    data: {
      id: attachmentId,
      rfqId: id,
      fileName,
      contentType: fileType,
      size: buffer.byteLength,
      note,
      storageKey: storageKey || "",
      data: storageKey ? null : buffer,
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

  await prisma.leadActivity.create({
    data: {
      rfqId: id,
      type: "NOTE",
      title: `Document uploaded · ${fileName}`,
      body: [
        note || null,
        `${formatAttachmentSize(buffer.byteLength)} · ${fileType || "file"}`,
      ]
        .filter(Boolean)
        .join("\n"),
      meta: {
        kind: "document",
        attachmentId: created.id,
        fileName,
        size: buffer.byteLength,
        contentType: fileType,
      },
      actorId: session?.user?.id,
    },
  });

  return NextResponse.json(meta(created), { status: 201 });
}
