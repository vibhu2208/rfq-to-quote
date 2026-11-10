import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import { listLeadActivities, logLeadActivity } from "@/lib/leads/activity";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await params;
  const items = await listLeadActivities(id, 200);
  return NextResponse.json({ items });
}

const noteSchema = z.object({
  title: z.string().optional().default("Note"),
  body: z.string().min(1),
  type: z
    .enum(["NOTE", "CALL", "EMAIL_SENT", "WHATSAPP", "OTHER"])
    .optional()
    .default("NOTE"),
});

export async function POST(req: NextRequest, { params }: Params) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { id } = await params;

  const body = await req.json();
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const activity = await logLeadActivity({
    rfqId: id,
    type: parsed.data.type,
    title: parsed.data.title,
    body: parsed.data.body,
    actorId: session?.user?.id,
  });

  return NextResponse.json(activity, { status: 201 });
}
