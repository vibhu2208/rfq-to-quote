import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { getAdminTaxonomy } from "@/lib/admin-taxonomy";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const categories = await getAdminTaxonomy();
  return NextResponse.json({ categories });
}
