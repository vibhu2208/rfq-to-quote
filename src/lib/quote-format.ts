export const QUOTE_NAVY = "#1F3A5F";
export const QUOTE_GRAY = "#666666";
export const QUOTE_MUTED_BG = "#F3F5F7";
export const QUOTE_LINE = "#D0D5DB";

/** Colors taken from public/quotation.docx (rptQuotOrder). */
export const QUOTE_TEMPLATE_BLUE = "#0000FF";
export const QUOTE_TEMPLATE_HEADER = "#FFFF00";
export const QUOTE_TEMPLATE_BORDER = "#000000";
export const QUOTE_LETTERHEAD_SRC = "/quote-letterhead.jpeg";
export const QUOTE_STAMP_SRC = "/quote-stamp.jpeg";

export function formatQuoteAmount(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export function formatTaxAnalysis(input: {
  taxable: number;
  withGst: boolean;
  gstBuckets: Array<[number, number]>;
  gstAmount: number;
  discountAmount?: number;
  discountPercent?: number;
  deliveryCharge?: number;
  otherTaxAmount?: number;
  otherTaxLabel?: string;
}): string {
  const parts = [`Tax Analysis: Taxable Amount: ${formatQuoteAmount(input.taxable)}`];
  if (input.withGst) {
    if (input.gstBuckets.length > 0) {
      for (const [rate, tax] of input.gstBuckets) {
        parts.push(`GST@${rate}% ${formatQuoteAmount(tax)}`);
      }
    } else if (input.gstAmount > 0) {
      parts.push(`GST ${formatQuoteAmount(input.gstAmount)}`);
    }
  }
  if (input.discountAmount && input.discountAmount > 0) {
    const pct =
      input.discountPercent && input.discountPercent > 0
        ? ` (${Number(input.discountPercent)}%)`
        : "";
    parts.push(`Discount${pct}: -${formatQuoteAmount(input.discountAmount)}`);
  }
  if (input.deliveryCharge && input.deliveryCharge > 0) {
    parts.push(`Delivery: ${formatQuoteAmount(input.deliveryCharge)}`);
  }
  if (input.otherTaxAmount && input.otherTaxAmount > 0) {
    parts.push(`${input.otherTaxLabel || "Other tax"}: ${formatQuoteAmount(input.otherTaxAmount)}`);
  }
  return parts.join("  ");
}

export function quoteIntro(companyName: string): string {
  const name = companyName.trim() || "us";
  return `At the outset we thank you for your interest in buying the products from ${name}. We are pleased to quote our best prices as:`;
}

export function defaultQuoteTerms(paymentTerms?: string): string {
  return `Payment Terms: ${paymentTerms?.trim() || "Against Delivery"}`;
}

export function quoteSignatoryName(signatory?: string): string {
  const name = signatory?.trim();
  if (!name || /^authorized signatory$/i.test(name)) return "Gopal Agrawal";
  return name;
}

/** Business calendar for quotations (India Standard Time). */
export const QUOTE_TIME_ZONE = "Asia/Kolkata";

type QuoteDatePattern = "yyyy-MM-dd" | "dd/MM/yyyy" | "dd MMM yyyy";

/**
 * Format a timestamp in IST so Preview/PDF/list dates don't shift on UTC servers.
 * Example: 2026-11-10T22:05:00Z (3:35 AM IST on 11 Nov) → 11/11/2026.
 */
export function formatQuoteInstant(
  date: Date | string | number | null | undefined,
  pattern: QuoteDatePattern = "dd/MM/yyyy",
  timeZone = QUOTE_TIME_ZONE
): string {
  if (date == null || date === "") return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: pattern === "dd MMM yyyy" ? "short" : "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || "";

  const y = get("year");
  const m = get("month");
  const day = get("day");
  if (!y || !m || !day) return "";

  if (pattern === "yyyy-MM-dd") {
    return `${y}-${m}-${day.padStart(2, "0")}`;
  }
  if (pattern === "dd MMM yyyy") {
    return `${day} ${m} ${y}`;
  }
  return `${day}/${m}/${y}`;
}

/** Today's quotation calendar date in IST as yyyy-MM-dd. */
export function todayQuoteDateIso(now: Date = new Date()): string {
  return formatQuoteInstant(now, "yyyy-MM-dd");
}

/** Display quotation date as dd/MM/yyyy from a yyyy-MM-dd value. */
export function formatQuoteDateDisplay(iso?: string | null): string {
  const datePart = (iso || todayQuoteDateIso()).slice(0, 10);
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return datePart;
  return `${d}/${m}/${y}`;
}

/**
 * Persist a calendar quote date as noon IST (06:30 UTC).
 * Avoids host-local `T12:00:00` parsing that flips the day on UTC servers.
 */
export function parseQuoteDate(iso?: string | null): Date | null {
  const datePart = iso?.trim().slice(0, 10);
  if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const d = new Date(`${datePart}T12:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Product details for a quote line, stripping a catalog "Name — details" prefix. */
export function quoteLineDetails(aliasName: string | null | undefined, description: string): string {
  const alias = aliasName?.trim() || "";
  const desc = description.trim();
  if (!desc) return "";
  if (alias && desc === alias) return "";
  if (alias && desc.startsWith(`${alias} — `)) return desc.slice(alias.length + 3);
  if (alias && desc.startsWith(`${alias} - `)) return desc.slice(alias.length + 3);
  return description;
}

export function formatQuoteHsn(hsn?: string | null): string {
  const value = hsn?.trim();
  return value ? value : "-";
}

export const DEFAULT_QUOTE_UNIT = "nos";

export const QUOTE_UNITS = [
  { value: "nos", label: "Nos" },
  { value: "pcs", label: "Pcs" },
  { value: "set", label: "Set" },
  { value: "box", label: "Box" },
  { value: "pkt", label: "Pkt" },
  { value: "bag", label: "Bag" },
  { value: "ctn", label: "Ctn" },
  { value: "doz", label: "Doz" },
  { value: "prs", label: "Pair" },
  { value: "rol", label: "Rol" },
  { value: "mtr", label: "Mtr" },
  { value: "sqm", label: "Sqm" },
  { value: "kgs", label: "Kgs" },
  { value: "ltr", label: "Ltr" },
  { value: "lot", label: "Lot" },
] as const;

export function normalizeQuoteUnit(unit?: string | null): string {
  const raw = (unit || DEFAULT_QUOTE_UNIT).trim();
  if (!raw) return DEFAULT_QUOTE_UNIT;
  const match = QUOTE_UNITS.find((u) => u.value.toLowerCase() === raw.toLowerCase());
  return match?.value || raw;
}

export function quoteUnitOptions(current?: string | null): Array<{ value: string; label: string }> {
  const value = normalizeQuoteUnit(current);
  if (QUOTE_UNITS.some((u) => u.value === value)) return [...QUOTE_UNITS];
  return [...QUOTE_UNITS, { value, label: value }];
}

/** Display unit on preview/PDF — preserves editor choice (Pcs stays PCS, not NOS). */
export function formatQuoteUnit(unit?: string | null): string {
  const raw = (unit || DEFAULT_QUOTE_UNIT).trim();
  if (!raw) return DEFAULT_QUOTE_UNIT.toUpperCase();
  if (/^(pc|pcs|piece|pieces)$/i.test(raw)) return "PCS";
  return normalizeQuoteUnit(raw).toUpperCase();
}

export function formatQuoteQty(
  qty: number,
  unit: string,
  showUnit?: boolean | null
): string {
  const q = Number.isInteger(qty) ? String(qty) : String(qty);
  if (!quoteShowUnit(showUnit)) return q;
  return `${q} ${formatQuoteUnit(unit)}`;
}

export const DEFAULT_QUOTE_TAGLINE = "ENABLING IT   |   ISO 9001:2015";
export const DEFAULT_QUOTE_SERVICES =
  "Computer Hardware & Software, Electrical & Electronic Kits, Networking, Corporate Training. Customized Software Solutions, Mobile App Development, E-Commerce Solutions, Plagiarism Checker";

export function quoteBankDetailsLine(company: {
  bankName?: string;
  bankBranch?: string;
  bankIfsc?: string;
  bankAccount?: string;
  bankAccountType?: string;
}): string | null {
  if (!company.bankName && !company.bankAccount) return null;
  return `Bank Details: ${[
    company.bankName,
    company.bankBranch ? `Branch: ${company.bankBranch}` : null,
    company.bankIfsc ? `IFSC Code: ${company.bankIfsc}` : null,
    company.bankAccount ? `A/C No: ${company.bankAccount}` : null,
    company.bankAccountType ? `A/C Type: ${company.bankAccountType}` : null,
  ]
    .filter(Boolean)
    .join("  ")}`;
}

export function quoteContactFooterLine(company: {
  address?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
}): string {
  return [
    company.address ? `Address: ${company.address}` : null,
    company.phone ? `PH: ${company.phone}` : null,
    company.mobile ? `Mobile: ${company.mobile}` : null,
    company.email ? `Email: ${company.email}` : null,
    company.website ? `Website: ${company.website}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

export function quoteShowHsn(showHsn?: boolean | null): boolean {
  return showHsn !== false;
}

export function quoteShowUnit(showUnit?: boolean | null): boolean {
  return showUnit !== false;
}

/** SN + description + qty + rate + amount, plus optional HSN and GST/tax. */
export function quoteTableColCount(withGst: boolean, showHsn: boolean): number {
  return 5 + (showHsn ? 1 : 0) + (withGst ? 2 : 0);
}

export function quoteWordsColSpan(withGst: boolean, showHsn: boolean): number {
  return 3 + (showHsn ? 1 : 0) + (withGst ? 1 : 0);
}

export const QUOTE_CLOSING =
  "We look forward to your favorable response to our proposal. We trust that you will find our offer competitive and would be pleased to receive your valued order. Should you require any further information or clarification, please feel free to contact us. We are committed to delivering the best products and services to your organization and assure you of our highest level of service at all times.";
