import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api";

type Row = Record<string, unknown>;

function pick(row: Row, keys: string[]): string {
  for (const k of keys) {
    const found = Object.keys(row).find((rk) => rk.trim().toLowerCase() === k.toLowerCase());
    if (found != null && row[found] != null && String(row[found]).trim() !== "") {
      return String(row[found]).trim();
    }
  }
  return "";
}

function num(row: Row, keys: string[], fallback = 0): number {
  const v = pick(row, keys);
  if (!v) return fallback;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRows(rows: Row[]) {
  return rows
    .map((row) => {
      const code = pick(row, ["code", "product_code", "sku", "product code"]);
      const name = pick(row, ["name", "product_name", "product name", "title"]);
      if (!code || !name) return null;
      return {
        code,
        name,
        description: pick(row, ["description", "desc", "details"]),
        unit: pick(row, ["unit", "uom"]) || "pcs",
        basePrice: num(row, ["base_price", "base price", "cost", "cost_price"], 0),
        offerPrice: num(row, ["offer_price", "offer price", "price", "selling_price"], 0),
        taxRate: num(row, ["tax_rate", "tax rate", "gst", "gst_rate"], 18),
        taxCategory: pick(row, ["tax_category", "tax category", "hsn"]) || "GST18",
        active: true,
      };
    })
    .filter(Boolean) as Array<{
    code: string;
    name: string;
    description: string;
    unit: string;
    basePrice: number;
    offerPrice: number;
    taxRate: number;
    taxCategory: string;
    active: boolean;
  }>;
}

export async function POST(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  let rows: Row[] = [];

  if (name.endsWith(".csv")) {
    const text = buffer.toString("utf-8");
    const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: true });
    rows = parsed.data;
  } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Row>(sheet);
  } else {
    return NextResponse.json({ error: "Only CSV or XLSX files are supported" }, { status: 400 });
  }

  const products = normalizeRows(rows);
  if (products.length === 0) {
    return NextResponse.json({ error: "No valid product rows found" }, { status: 400 });
  }

  let created = 0;
  let updated = 0;

  for (const p of products) {
    const existing = await prisma.product.findUnique({ where: { code: p.code } });
    if (existing) {
      await prisma.product.update({ where: { code: p.code }, data: p });
      updated += 1;
    } else {
      await prisma.product.create({ data: p });
      created += 1;
    }
  }

  return NextResponse.json({ created, updated, total: products.length });
}
