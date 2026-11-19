import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { parseTagsJson } from "@/lib/telemarketing/contact-update";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const rows = await prisma.telemarketingContact.findMany({
    where: { archivedAt: null, primaryContactId: null },
    select: { tags: true },
    take: 5000,
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of parseTagsJson(row.tags as unknown)) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  const tags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => ({ tag, count }));

  return NextResponse.json({ tags });
}