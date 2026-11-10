import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import { getTaxonomySubcategoryVendors } from "@/lib/admin-taxonomy";

/** Vendors mapped to one category/subcategory (lazy-loaded for mapping UI). */
export async function GET(request: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const category = request.nextUrl.searchParams.get("category")?.trim() || "";
  const subcategory =
    request.nextUrl.searchParams.get("subcategory")?.trim() || "";
  if (!category) {
    return NextResponse.json(
      { error: "category is required" },
      { status: 400 }
    );
  }

  const vendors = await getTaxonomySubcategoryVendors({
    category,
    subcategory,
  });
  return NextResponse.json({ vendors });
}
