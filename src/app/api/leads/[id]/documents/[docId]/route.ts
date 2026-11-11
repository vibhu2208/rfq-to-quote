import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import {
  deleteLeadAttachmentFile,
  downloadLeadAttachmentFile,
} from "@/lib/supabase-storage";

type Params = { params: Promise<{ id: string; docId: string }> };

export const dynamic = "force-dynamic";

function dispositionName(name: string): string {
  return name.replace(/["\\]/g, "_");
}

export async function GET(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, docId } = await params;
  const inline = req.nextUrl.searchParams.get("inline") === "1";
  const row = await prisma.leadAttachment.findFirst({
    where: { id: docId, rfqId: id },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let bytes: Uint8Array | null = row.data ? new Uint8Array(row.data) : null;
  if ((!bytes || bytes.length === 0) && row.storageKey) {
    const stored = await downloadLeadAttachmentFile(row.storageKey);
    if (stored) bytes = new Uint8Array(stored);
  }

  if (!bytes || bytes.length <= 0) {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }

  const type = row.contentType || "application/octet-stream";
  const canInline =
    inline &&
    (type.startsWith("image/") ||
      type === "application/pdf" ||
      type.startsWith("text/"));

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Disposition": `${canInline ? "inline" : "attachment"}; filename="${dispositionName(row.fileName)}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, docId } = await params;
  const row = await prisma.leadAttachment.findFirst({
    where: { id: docId, rfqId: id },
    select: { id: true, storageKey: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (row.storageKey) {
    await deleteLeadAttachmentFile(row.storageKey).catch(() => undefined);
  }
  await prisma.leadAttachment.delete({ where: { id: row.id } });
  return NextResponse.json({ ok: true });
}
