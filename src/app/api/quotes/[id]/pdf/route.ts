import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { buildQuotePdfBuffer } from "@/lib/pdf/render-quote-buffer";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      lineItems: {
        include: { product: { select: { code: true, hsnCode: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!quote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { buffer, filename } = await buildQuotePdfBuffer(quote);

  const dir = path.join(process.cwd(), "generated", "quotes");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), buffer);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
