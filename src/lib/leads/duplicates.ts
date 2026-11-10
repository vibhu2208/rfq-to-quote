import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeCompany(company: string) {
  return company.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function findDuplicateLeads(input: {
  email?: string;
  phone?: string;
  company?: string;
  excludeId?: string;
  take?: number;
}) {
  const or: Prisma.RfqWhereInput[] = [];

  if (input.email?.trim()) {
    or.push({
      customerEmail: { equals: normalizeEmail(input.email), mode: "insensitive" },
    });
  }

  const phoneDigits = input.phone ? normalizePhone(input.phone) : "";
  if (phoneDigits.length >= 7) {
    or.push({ customerPhone: { contains: phoneDigits.slice(-10) } });
  }

  if (input.company?.trim()) {
    or.push({
      customerCompany: {
        equals: normalizeCompany(input.company),
        mode: "insensitive",
      },
    });
  }

  if (!or.length) return [];

  return prisma.rfq.findMany({
    where: {
      archivedAt: null,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      OR: or,
    },
    take: input.take ?? 10,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      leadNumber: true,
      customerName: true,
      customerCompany: true,
      customerEmail: true,
      customerPhone: true,
      leadStage: true,
      createdAt: true,
    },
  });
}
