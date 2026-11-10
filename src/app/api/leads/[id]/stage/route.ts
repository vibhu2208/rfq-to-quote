import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { LeadStage } from "@prisma/client";
import { requireSession } from "@/lib/api";
import { changeLeadStage } from "@/lib/leads/stage";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  toStage: z.nativeEnum(LeadStage),
  reason: z.string().optional(),
  stageDetail: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { id } = await params;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const updated = await changeLeadStage({
      rfqId: id,
      toStage: parsed.data.toStage,
      reason: parsed.data.reason,
      stageDetail: parsed.data.stageDetail,
      actorId: session?.user?.id,
    });
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stage change failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
