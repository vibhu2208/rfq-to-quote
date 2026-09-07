import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { commitVendorImport } from "@/lib/vendor-import";
import { vendorInputSchema } from "@/lib/vendor-schema";

const commitSchema = z.object({
  items: z.array(
    vendorInputSchema.and(
      z.object({
        action: z.enum(["create", "update"]),
        existingVendorId: z.string().nullable(),
      })
    )
  ),
});

export async function POST(request: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = commitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await commitVendorImport(parsed.data.items);
    return NextResponse.json(result);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
