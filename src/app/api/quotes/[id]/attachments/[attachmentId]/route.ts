import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import {
  deleteQuoteAttachmentFile,
  downloadQuoteAttachmentFile,
} from "@/lib/supabase-storage";

type Params = { params: Promise<{ id: string; attachmentId: string }> };

export const dynamic = "force-dynamic";

function dispositionName(name: string): string {
  return name.replace(/["\\]/g, "_");
}

export async function GET(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id, attachmentId } = await params;
  const inline = req.nextUrl.searchParams.get("inline") === "1";
  const row = await prisma.quoteAttachment.findFirst({
    where: { id: attachmentId, quoteId: id },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let bytes = row.data ? Buffer.from(row.data) : null;
  if (!bytes || bytes.length === 0) {
    const stored = await prisma.$queryRaw<Array<{ storageKey: string }>>`
      SELECT "storageKey" FROM "QuoteAttachment" WHERE id = ${row.id}
    `;
    const storageKey = stored[0]?.storageKey;
    if (storageKey) bytes = await downloadQuoteAttachmentFile(storageKey);
  }

  if (!bytes || bytes.length <= 0) {
    return new NextResponse(row.note || "", {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${dispositionName(row.fileName || "note.txt")}"`,
      },
    });
  }

  const type = row.contentType || "application/octet-stream";
  const canInline = inline && (type.startsWith("image/") || type === "application/pdf" || type.startsWith("text/"));

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

  const { id, attachmentId } = await params;
  const row = await prisma.quoteAttachment.findFirst({
    where: { id: attachmentId, quoteId: id },
    select: { id: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const stored = await prisma.$queryRaw<Array<{ storageKey: string }>>`
    SELECT "storageKey" FROM "QuoteAttachment" WHERE id = ${row.id}
  `;
  const storageKey = stored[0]?.storageKey;
  if (storageKey) {
    await deleteQuoteAttachmentFile(storageKey).catch(() => undefined);
  }
  await prisma.quoteAttachment.delete({ where: { id: row.id } });
  return NextResponse.json({ ok: true });
}
