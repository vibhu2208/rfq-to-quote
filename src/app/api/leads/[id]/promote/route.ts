import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { promoteLeadFromJunk } from "@/lib/leads/promote";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  reason: z.string().optional(),
  autoParse: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;

  const { id } = await params;
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const lead = await promoteLeadFromJunk({
      rfqId: id,
      actorId: session?.user?.id,
      reason: parsed.data.reason,
      autoParse: parsed.data.autoParse,
    });
    return NextResponse.json(lead);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Promote failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
