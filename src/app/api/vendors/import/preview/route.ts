import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api";
import {
  buildVendorImportPreview,
  parseVendorFile,
} from "@/lib/vendor-import";

export async function POST(request: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV/XLSX file is required" }, { status: 400 });
    }

    const rows = parseVendorFile(
      Buffer.from(await file.arrayBuffer()),
      file.name
    );
    const preview = await buildVendorImportPreview(rows);
    return NextResponse.json(preview);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Preview failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
