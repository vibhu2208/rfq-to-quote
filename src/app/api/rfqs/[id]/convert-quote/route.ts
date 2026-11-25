import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import {
  createQuoteFromRfq,
  QuoteLineValidationError,
  syncDraftQuoteFromRfq,
} from "@/lib/quote-from-rfq";
import { Prisma } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  productIds: z.array(z.string()).optional(),
  quantities: z.record(z.string(), z.coerce.number()).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1).optional().nullable(),
        qty: z.coerce.number().optional(),
        unitPrice: z.coerce.number().optional(),
        costPrice: z.coerce.number().optional(),
        costVendorName: z.string().optional(),
        aliasName: z.string().optional(),
        unit: z.string().optional(),
      })
    )
    .optional(),
  syncDraft: z.boolean().optional(),
});

/**
 * Creates a draft quote from RFQ.
 * If productIds provided, uses matched catalog products (offer prices).
 * Otherwise falls back to a single text line from parsed specs.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;

  let productIds: string[] = [];
  let quantities: Record<string, number> = {};
  let lines: Array<{
    productId: string | null;
    qty: number;
    unitPrice?: number;
    costPrice?: number;
    costVendorName?: string;
    aliasName?: string;
    unit?: string;
  }> = [];
  let syncDraft = false;
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (parsed.success) {
      productIds = parsed.data.productIds || [];
      quantities = parsed.data.quantities || {};
      syncDraft = Boolean(parsed.data.syncDraft);
      lines = (parsed.data.lines || []).map((line) => ({
        productId: line.productId?.trim() || null,
        qty: line.qty && line.qty > 0 ? line.qty : 1,
        unitPrice: line.unitPrice,
        costPrice: line.costPrice,
        costVendorName: line.costVendorName?.trim() || undefined,
        aliasName: line.aliasName?.trim() || undefined,
        unit: line.unit?.trim() || undefined,
      }));
    }
  } catch {
    // empty body ok
  }

  const rfqLines = lines.filter(
    (line): line is typeof line & { productId: string } => Boolean(line.productId)
  );

  try {
    const createInput = {
      rfqId: id,
      productIds,
      quantities,
      lines:
        lines.length > 0
          ? lines.map((line) => ({
              productId: line.productId,
              qty: line.qty,
              unitPrice: line.unitPrice,
              costPrice: line.costPrice,
              costVendorName: line.costVendorName,
              aliasName: line.aliasName,
              unit: line.unit,
            }))
          : undefined,
    };
    const quote = syncDraft
      ? await syncDraftQuoteFromRfq(createInput)
      : await createQuoteFromRfq({
          ...createInput,
          lines: rfqLines.length > 0 ? rfqLines : createInput.lines,
        });
    return NextResponse.json(
      { id: quote.id, quoteNumber: quote.quoteNumber, updated: syncDraft },
      { status: syncDraft ? 200 : 201 }
    );
  } catch (e) {
    if (e instanceof QuoteLineValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P22003"
    ) {
      return NextResponse.json(
        {
          error:
            "A line amount is too large to save. Lower quantity or sell price on the oversized line.",
        },
        { status: 400 }
      );
    }
    const message = e instanceof Error ? e.message : "Failed to create quote";
    const status = message === "RFQ not found" ? 404 : 500;
    const friendly =
      /numeric field overflow|22003|P22003/i.test(message)
        ? "A line amount is too large to save. Lower quantity or sell price on the oversized line."
        : message;
    return NextResponse.json(
      { error: status === 404 ? "Not found" : friendly },
      { status }
    );
  }
}
