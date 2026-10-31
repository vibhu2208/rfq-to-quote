import Papa from "papaparse";
import * as XLSX from "xlsx";

export type QuoteCsvItem = {
  productName: string;
  model: string;
  brand: string;
  code: string;
  extraNotes: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

export type QuoteCsvParseResult = {
  items: QuoteCsvItem[];
  company: string;
};

type SourceRow = Record<string, unknown>;

const NAME_KEYS = [
  "product",
  "product name",
  "productname",
  "item",
  "item name",
  "itemname",
  "particulars",
  "material",
  "name",
  "title",
  "goods",
];

const NOTES_KEYS = [
  "description",
  "item description",
  "product description",
  "remarks",
  "notes",
  "specification",
  "specs",
  "details",
];

const CODE_KEYS = [
  "sku",
  "code",
  "product code",
  "productcode",
  "item code",
  "itemcode",
  "part",
  "part no",
  "partno",
  "part number",
  "model",
  "model no",
  "modelno",
  "hsn",
];

const QTY_KEYS = [
  "qty",
  "quantity",
  "qty req",
  "qty required",
  "required qty",
  "req qty",
  "ordered qty",
  "nos",
  "units",
];

const UNIT_KEYS = ["unit", "uom", "uom name", "nos", "no s"];
const PRICE_KEYS = ["rate", "price", "unit price", "unitprice", "offer price", "mrp"];
const BRAND_KEYS = ["brand", "make", "manufacturer"];
const COMPANY_KEYS = ["company", "client", "customer", "buyer", "party"];
const SKIP_KEYS = new Set(["s no", "sr no", "srno", "sno", "sl no", "slno", "serial", "#"]);

function normKey(key: string): string {
  return key
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pick(row: SourceRow, aliases: string[]): string {
  const entries = Object.entries(row).map(([k, v]) => [normKey(k), v] as const);
  for (const alias of aliases) {
    const found = entries.find(([k]) => k === alias);
    if (found && found[1] != null && String(found[1]).trim() !== "") {
      return String(found[1]).trim();
    }
  }
  return "";
}

function num(value: string, fallback = 0): number {
  if (!value) return fallback;
  const n = Number(String(value).replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

export function isQuoteSpreadsheet(filename: string, mime = ""): boolean {
  const lower = filename.toLowerCase();
  if (/\.(csv|xlsx|xls)$/i.test(lower)) return true;
  return /csv|spreadsheetml|excel/i.test(mime);
}

function recognizedHeader(keys: string[]): boolean {
  const norms = keys.map(normKey).filter(Boolean);
  return norms.some(
    (k) =>
      NAME_KEYS.includes(k) ||
      NOTES_KEYS.includes(k) ||
      CODE_KEYS.includes(k) ||
      QTY_KEYS.includes(k)
  );
}

function rowsFromCsv(text: string): SourceRow[] {
  const withHeader = Papa.parse<SourceRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });
  const headerKeys = withHeader.meta.fields || [];
  if (headerKeys.length > 0 && recognizedHeader(headerKeys)) {
    return withHeader.data;
  }

  const raw = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
  });
  return (raw.data || [])
    .filter((row) => Array.isArray(row) && row.some((cell) => String(cell || "").trim()))
    .map((row) => ({
      name: String(row[0] || "").trim(),
      qty: String(row[1] || "").trim(),
      unit: String(row[2] || "").trim(),
      sku: String(row[3] || "").trim(),
    }));
}

function rowsFromWorkbook(buffer: Buffer): SourceRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const withHeader = XLSX.utils.sheet_to_json<SourceRow>(sheet, { defval: "" });
  if (withHeader.length > 0 && recognizedHeader(Object.keys(withHeader[0] || {}))) {
    return withHeader;
  }
  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
  });
  return matrix
    .filter((row) => Array.isArray(row) && row.some((cell) => String(cell || "").trim()))
    .map((row) => ({
      name: String(row[0] || "").trim(),
      qty: String(row[1] || "").trim(),
      unit: String(row[2] || "").trim(),
      sku: String(row[3] || "").trim(),
    }));
}

function rowToItem(row: SourceRow): QuoteCsvItem | null {
  const keys = Object.keys(row).map(normKey);
  if (keys.length > 0 && keys.every((k) => SKIP_KEYS.has(k))) return null;

  const name = pick(row, NAME_KEYS);
  const notes = pick(row, NOTES_KEYS);
  const code = pick(row, CODE_KEYS);
  const brand = pick(row, BRAND_KEYS);
  const productName = name || notes || code;
  if (!productName && !code) return null;

  const qtyRaw = pick(row, QTY_KEYS);
  const quantity = Math.max(1, num(qtyRaw, 1));
  return {
    productName: productName || code,
    model: pick(row, ["model", "model no", "modelno"]),
    brand,
    code,
    extraNotes: name && notes && notes !== name ? notes : "",
    quantity,
    unit: pick(row, UNIT_KEYS),
    unitPrice: num(pick(row, PRICE_KEYS), 0),
  };
}

export function parseQuoteSpreadsheet(buffer: Buffer, filename: string): QuoteCsvParseResult {
  const lower = filename.toLowerCase();
  const text = buffer.toString("utf-8");
  const rows = lower.endsWith(".csv") || (!lower.includes(".") && text.includes(","))
    ? rowsFromCsv(text.replace(/^\uFEFF/, ""))
    : rowsFromWorkbook(buffer);

  const items = rows.map(rowToItem).filter((row): row is QuoteCsvItem => row != null);
  const companies = rows
    .map((row) => pick(row, COMPANY_KEYS))
    .filter(Boolean);
  const company = companies.find((c) => c) || "";

  return { items, company };
}
