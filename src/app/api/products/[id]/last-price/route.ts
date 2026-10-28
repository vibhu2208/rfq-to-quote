import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { recordProductLastPrice } from "@/lib/product-price";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  price: z.coerce.number().nonnegative(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid price" }, { status: 400 });
  }

  try {
    const updated = await recordProductLastPrice(id, parsed.data.price);
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save price";
    const status = message.includes("Record to update does not exist") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
