import { prisma } from "@/lib/prisma";

export async function nextLeadNumber(now = new Date()): Promise<string> {
  const year = now.getFullYear();
  const prefix = `L-${year}-`;
  const latest = await prisma.rfq.findFirst({
    where: { leadNumber: { startsWith: prefix } },
    orderBy: { leadNumber: "desc" },
    select: { leadNumber: true },
  });

  let seq = 1;
  if (latest?.leadNumber) {
    const raw = latest.leadNumber.slice(prefix.length);
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= seq) seq = n + 1;
  }

  return `${prefix}${String(seq).padStart(5, "0")}`;
}
