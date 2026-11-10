import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });

  return NextResponse.json({ items: users });
}
