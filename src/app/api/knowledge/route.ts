import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";
import { requireUserId } from "@/lib/api/session-user";
import { captureHumanQa, inferKnowledgeTags } from "@/lib/ai/knowledge";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const entries = await prisma.knowledgeEntry.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      quote: { select: { quoteNumber: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json(
    entries.map((e) => ({
      id: e.id,
      question: e.question,
      answer: e.answer,
      tags: e.tags,
      source: e.source,
      active: e.active,
      quoteId: e.quoteId,
      quoteNumber: e.quote?.quoteNumber ?? null,
      createdBy: e.createdBy?.name || e.createdBy?.email || null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }))
  );
}

const createSchema = z.object({
  question: z.string().min(8),
  answer: z.string().min(8),
  tags: z.array(z.string()).optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  answer: z.string().min(8).optional(),
  question: z.string().min(8).optional(),
  active: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireSession();
  if (error) return error;
  const { userId } = requireUserId(session);

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const id = await captureHumanQa({
    question: parsed.data.question,
    answer: parsed.data.answer,
    createdById: userId ?? undefined,
    source: "MANUAL",
  });
  if (!id) {
    return NextResponse.json({ error: "Question and answer are too short." }, { status: 400 });
  }

  if (parsed.data.tags?.length) {
    await prisma.knowledgeEntry.update({
      where: { id },
      data: { tags: [...new Set([...inferKnowledgeTags(`${parsed.data.question} ${parsed.data.answer}`), ...parsed.data.tags])] },
    });
  }

  return NextResponse.json({ ok: true, id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.knowledgeEntry.findUnique({ where: { id: parsed.data.id } });
  if (!existing) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  const updated = await prisma.knowledgeEntry.update({
    where: { id: parsed.data.id },
    data: {
      ...(parsed.data.answer != null ? { answer: parsed.data.answer.trim() } : {}),
      ...(parsed.data.question != null ? { question: parsed.data.question.trim() } : {}),
      ...(parsed.data.active != null ? { active: parsed.data.active } : {}),
      ...(parsed.data.tags != null ? { tags: parsed.data.tags } : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    id: updated.id,
    active: updated.active,
  });
}
