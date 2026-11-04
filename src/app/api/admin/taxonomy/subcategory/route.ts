import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/api";
import {
  addTaxonomySubcategory,
  removeTaxonomySubcategory,
} from "@/lib/admin-taxonomy";

const bodySchema = z.object({
  category: z.string().trim().min(1, "Category is required"),
  subcategory: z.string().trim().min(1, "Subcategory is required"),
});

const deleteBodySchema = z.object({
  category: z.string().trim().min(1, "Category is required"),
  subcategory: z.string().trim().optional().default(""),
});

/** Persist an admin-defined subcategory under a category. */
export async function POST(request: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await addTaxonomySubcategory(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add subcategory" },
      { status: 400 }
    );
  }
}

/** Remove admin subcategory label and all vendor mappings for that pair. */
export async function DELETE(request: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const json = await request.json().catch(() => null);
  const parsed = deleteBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await removeTaxonomySubcategory(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove subcategory" },
      { status: 400 }
    );
  }
}
