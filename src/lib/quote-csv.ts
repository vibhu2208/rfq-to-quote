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
  taxRate: number | null;
  hsnCode: string;
};

export type QuoteCsvParseResult = {
  items: QuoteCsvItem[];
  company: string;
};

type SourceRow = Record<string, unknown>;

const NAME_KEYS = [
  "product description",
  "item description",
  "product name",
  "productname",
  "item name",
  "itemname",
  "particulars",
  "material",
  "product",
  "item",
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

const UNIT_KEYS = ["unit", "uom", "uom name", "unit name", "nos", "no s"];
const PRICE_KEYS = [
  "est unit price",
  "unit price",
  "unitprice",
  "unit rate",
  "basic rate",
  "list price",
  "offer price",
  "selling price",
  "rate",
  "price",
  "mrp",
];
const AMOUNT_KEYS = [
  "est amount",
  "amount ex gst",
  "taxable value",
  "taxable",
  "line total",
  "line amount",
  "amount",
  "value",
];
const TAX_KEYS = ["gst %", "gst%", "gst rate", "tax %", "tax%", "tax rate", "taxrate", "gst", "tax"];
const HSN_KEYS = ["hsn", "hsn code", "hsncode", "sac", "sac code"];
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

function headerAliasScore(header: string, alias: string): number {
  if (!header || !alias) return 0;
  if (header === alias) return 100 + alias.length;
  if (header.startsWith(`${alias} `)) return 80 + alias.length;
  if (` ${header} `.includes(` ${alias} `)) return 50 + alias.length;
  const aliasTokens = alias.split(/\s+/).filter(Boolean);
  const headerTokens = new Set(header.split(/\s+/).filter(Boolean));
  if (aliasTokens.length > 0 && aliasTokens.every((token) => headerTokens.has(token))) {
    return 30 + alias.length;
  }
  return 0;
}

function bestHeader(
  keys: string[],
  aliases: string[],
  exclude?: (header: string) => boolean
): string {
  let bestKey = "";
  let bestScore = 0;
  for (const key of keys) {
    const header = normKey(key);
    if (!header || exclude?.(header)) continue;
    for (const alias of aliases) {
      const score = headerAliasScore(header, alias);
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }
  }
  return bestKey;
}

function pick(
  row: SourceRow,
  aliases: string[],
  exclude?: (header: string) => boolean
): string {
  const key = bestHeader(Object.keys(row), aliases, exclude);
  if (!key) return "";
  const value = row[key];
  if (value == null || String(value).trim() === "") return "";
  return String(value).trim();
}

function isTotalHeader(header: string): boolean {
  if (header.includes("unit price")) return false;
  if (/\brate\b/.test(header) && !header.includes("amount") && !header.includes("total")) {
    return false;
  }
  return header.includes("amount") || header.includes("total") || header.includes("value");
}

/** Price/amount columns must never be treated as UOM — "unit" matches "EST. UNIT PRICE". */
function isNotUomHeader(header: string): boolean {
  return (
    header.includes("price") ||
    header.includes("amount") ||
    header.includes("total") ||
    header.includes("rate") ||
    header.includes("gst") ||
    header.includes("tax") ||
    header.includes("mrp") ||
    header.includes("value") ||
    header.includes("qty") ||
    header.includes("quantity")
  );
}

function looksLikeAmount(value: string): boolean {
  const t = value.replace(/,/g, "").replace(/^[₹$€£]\s*/, "").trim();
  if (!t) return true;
  return /^\d+(\.\d+)?$/.test(t);
}

function headerMatchesAny(header: string, aliases: string[]): boolean {
  return aliases.some((alias) => headerAliasScore(header, alias) > 0);
}

function sheetScore(keys: string[]): number {
  const headers = keys.map(normKey).filter(Boolean);
  let score = 0;
  if (headers.some((h) => headerMatchesAny(h, QTY_KEYS))) score += 3;
  if (headers.some((h) => headerMatchesAny(h, PRICE_KEYS) && !isTotalHeader(h))) score += 5;
  if (headers.some((h) => headerMatchesAny(h, NAME_KEYS) || headerMatchesAny(h, NOTES_KEYS))) {
    score += 2;
  }
  if (headers.some((h) => isTotalHeader(h))) score += 1;
  return score;
}

function taxRateFromHeaders(keys: string[]): number | null {
  for (const key of keys) {
    const header = normKey(key);
    const matched =
      header.match(/\b(?:gst|tax|igst|cgst|sgst)\b[^\d]*(\d{1,2}(?:\.\d+)?)/) ||
      header.match(/(\d{1,2}(?:\.\d+)?)\s*%/);
    if (!matched) continue;
    const rate = Number(matched[1]);
    if (rate > 0 && rate <= 40) return rate;
  }
  return null;
}

function rowTaxRate(row: SourceRow): number | null {
  const fromHeader = taxRateFromHeaders(Object.keys(row));
  if (fromHeader != null) return fromHeader;
  const raw = pick(row, TAX_KEYS, (header) => isTotalHeader(header) || header.includes("amount"));
  const parsed = parseTaxRate(raw);
  if (parsed != null && parsed <= 40) return parsed;
  return null;
}

function num(value: string, fallback = 0): number {
  if (!value) return fallback;
  const n = Number(String(value).replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function parseTaxRate(value: string): number | null {
  if (!value.trim()) return null;
  const n = num(value, Number.NaN);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > 0 && n <= 1) return Math.round(n * 10000) / 100;
  return n;
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
      headerMatchesAny(k, NAME_KEYS) ||
      headerMatchesAny(k, NOTES_KEYS) ||
      headerMatchesAny(k, CODE_KEYS) ||
      headerMatchesAny(k, QTY_KEYS) ||
      headerMatchesAny(k, PRICE_KEYS)
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
  let bestRows: SourceRow[] = [];
  let bestScore = -1;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const withHeader = XLSX.utils.sheet_to_json<SourceRow>(sheet, { defval: "" });
    if (withHeader.length === 0) continue;
    const keys = Object.keys(withHeader[0] || {});
    if (!recognizedHeader(keys)) continue;
    const score = sheetScore(keys);
    if (score > bestScore) {
      bestScore = score;
      bestRows = withHeader;
    }
  }
  if (bestRows.length > 0) return bestRows;

  const fallback = workbook.Sheets[workbook.SheetNames[0]];
  if (!fallback) return [];
  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(fallback, {
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
  const unitPriceRaw = num(pick(row, PRICE_KEYS, isTotalHeader), 0);
  const lineAmount = num(
    pick(row, AMOUNT_KEYS, (header) => header.includes("unit price") || header.includes("incl")),
    0
  );
  const unitPrice =
    unitPriceRaw > 0
      ? unitPriceRaw
      : lineAmount > 0
        ? Math.round((lineAmount / quantity) * 100) / 100
        : 0;
  const unitRaw = pick(row, UNIT_KEYS, isNotUomHeader);
  return {
    productName: productName || code,
    model: pick(row, ["model", "model no", "modelno"]),
    brand,
    code,
    extraNotes: name && notes && notes !== name ? notes : "",
    quantity,
    unit: looksLikeAmount(unitRaw) ? "" : unitRaw,
    unitPrice,
    taxRate: rowTaxRate(row),
    hsnCode: pick(row, HSN_KEYS),
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
