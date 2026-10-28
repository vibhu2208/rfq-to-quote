import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { createQuoteFromRfq } from "@/lib/quote-from-rfq";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  productIds: z.array(z.string()).optional(),
  quantities: z.record(z.string(), z.coerce.number()).optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.coerce.number().optional(),
        unitPrice: z.coerce.number().optional(),
      })
    )
    .optional(),
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
  let lines: Array<{ productId: string; qty: number; unitPrice?: number }> = [];
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (parsed.success) {
      productIds = parsed.data.productIds || [];
      quantities = parsed.data.quantities || {};
      lines = parsed.data.lines || [];
    }
  } catch {
    // empty body ok
  }

  try {
    const quote = await createQuoteFromRfq({
      rfqId: id,
      productIds,
      quantities,
      lines,
    });
    return NextResponse.json({ id: quote.id, quoteNumber: quote.quoteNumber }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create quote";
    const status = message === "RFQ not found" ? 404 : 500;
    return NextResponse.json(
      { error: status === 404 ? "Not found" : message },
      { status }
    );
  }
}
