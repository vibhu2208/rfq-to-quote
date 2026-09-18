import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { buildInvoicePdfBuffer } from "@/lib/pdf/render-invoice-buffer";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        party: true,
        lines: {
          include: { product: { select: { code: true } } },
          orderBy: { lineNumber: "asc" },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { buffer, filename } = await buildInvoicePdfBuffer(invoice);

    const dir = path.join(process.cwd(), "generated", "invoices");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), buffer);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("GET /api/invoices/[id]/pdf failed", err);
    const message = err instanceof Error ? err.message : "PDF generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
