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

export type QuoteGstSplitLabel = "IGST" | "CGST_SGST" | "NONE";

/** Name the tax the quote actually computed (interstate IGST vs intra-state CGST+SGST). */
export function quoteGstSplitFromAmounts(input: {
  withGst: boolean;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
}): QuoteGstSplitLabel {
  if (!input.withGst) return "NONE";
  const igst = Number(input.igstAmount) || 0;
  const cgst = Number(input.cgstAmount) || 0;
  const sgst = Number(input.sgstAmount) || 0;
  if (igst > 0 && cgst <= 0 && sgst <= 0) return "IGST";
  if (cgst > 0 || sgst > 0) return "CGST_SGST";
  return "NONE";
}

function halfMoney(amount: number): [number, number] {
  const first = Math.round((amount / 2) * 100) / 100;
  const second = Math.round((amount - first) * 100) / 100;
  return [first, second];
}

function halfRateLabel(rate: number): string {
  const half = rate / 2;
  return Number.isInteger(half) ? String(half) : String(half);
}

function pushGstBucket(
  parts: string[],
  rate: number,
  tax: number,
  split?: QuoteGstSplitLabel
) {
  if (split === "IGST") {
    parts.push(`IGST@${rate}% ${formatQuoteAmount(tax)}`);
    return;
  }
  if (split === "CGST_SGST") {
    const [cgst, sgst] = halfMoney(tax);
    const half = halfRateLabel(rate);
    parts.push(`CGST@${half}% ${formatQuoteAmount(cgst)}`);
    parts.push(`SGST@${half}% ${formatQuoteAmount(sgst)}`);
    return;
  }
  parts.push(`GST@${rate}% ${formatQuoteAmount(tax)}`);
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
  /** When set, tax lines say IGST or CGST+SGST instead of a generic GST. */
  gstSplit?: QuoteGstSplitLabel;
}): string {
  const parts = [`Tax Analysis: Taxable Amount: ${formatQuoteAmount(input.taxable)}`];
  if (input.withGst) {
    if (input.gstBuckets.length > 0) {
      for (const [rate, tax] of input.gstBuckets) {
        pushGstBucket(parts, rate, tax, input.gstSplit);
      }
    } else if (input.gstAmount > 0) {
      if (input.gstSplit === "IGST") {
        parts.push(`IGST ${formatQuoteAmount(input.gstAmount)}`);
      } else if (input.gstSplit === "CGST_SGST") {
        const [cgst, sgst] = halfMoney(input.gstAmount);
        parts.push(`CGST ${formatQuoteAmount(cgst)}`);
        parts.push(`SGST ${formatQuoteAmount(sgst)}`);
      } else {
        parts.push(`GST ${formatQuoteAmount(input.gstAmount)}`);
      }
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
    parts.push(`Freight: ${formatQuoteAmount(input.deliveryCharge)}`);
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

/** Customer-facing rate: list price, plus a line discount when one was applied. */
export function formatQuoteRateLabel(
  unitPrice: number,
  discountPercent?: number | null
): { amount: string; discountLabel: string | null } {
  const pct = Number(discountPercent);
  const hasDiscount = Number.isFinite(pct) && pct > 0;
  const shown = hasDiscount ? Math.min(100, Math.round(pct * 100) / 100) : 0;
  const pretty = Number.isInteger(shown) ? String(shown) : String(shown);
  return {
    amount: formatQuoteAmount(unitPrice || 0),
    discountLabel: hasDiscount ? `less ${pretty}%` : null,
  };
}

/**
 * Buyer meta line on the quotation. Blank phone and GSTIN are omitted so the
 * document does not print dangling "M: ." or "GSTIN:" labels.
 */
export function quoteBuyerContactParts(input: {
  state?: string | null;
  phone?: string | null;
  gstin?: string | null;
}): { lead: string; gstin: string } {
  const state = input.state?.trim() || "";
  const phone = input.phone?.trim() || "";
  const gstin = input.gstin?.trim() || "";
  return {
    lead: [state, phone ? `M: ${phone}` : ""].filter(Boolean).join("  "),
    gstin,
  };
}

export function quoteBuyerContactLine(input: {
  state?: string | null;
  phone?: string | null;
  gstin?: string | null;
}): string {
  const { lead, gstin } = quoteBuyerContactParts(input);
  return [lead, gstin ? `GSTIN: ${gstin}` : ""].filter(Boolean).join("  ");
}

export const DEFAULT_QUOTE_TAGLINE = "ENABLING IT   |   ISO 9001:2015";
export const DEFAULT_QUOTE_SERVICES =
  "Computer Hardware & Software, Electrical & Electronic Kits, Networking, Corporate Training. Customized Software Solutions, Mobile App Development, E-Commerce Solutions, Plagiarism Checker";

export type QuoteFooterLines = {
  line1: string | null;
  line2: string | null;
};

export function quoteBankDetailsLines(company: {
  bankName?: string;
  bankBranch?: string;
  bankIfsc?: string;
  bankAccount?: string;
  bankAccountType?: string;
}): QuoteFooterLines {
  const parts = [
    company.bankName,
    company.bankBranch ? `Branch: ${company.bankBranch}` : null,
    company.bankIfsc ? `IFSC Code: ${company.bankIfsc}` : null,
    company.bankAccount ? `A/C No: ${company.bankAccount}` : null,
    company.bankAccountType ? `A/C Type: ${company.bankAccountType}` : null,
  ].filter(Boolean);

  if (parts.length === 0) {
    return { line1: null, line2: null };
  }

  return {
    line1: `Bank Details: ${parts.join("  ")}`,
    line2: null,
  };
}

/** @deprecated Prefer quoteBankDetailsLines for two-line footer layout. */
export function quoteBankDetailsLine(company: {
  bankName?: string;
  bankBranch?: string;
  bankIfsc?: string;
  bankAccount?: string;
  bankAccountType?: string;
}): string | null {
  const { line1, line2 } = quoteBankDetailsLines(company);
  if (!line1 && !line2) return null;
  return [line1, line2].filter(Boolean).join("  ");
}

function peelContactField(
  raw: string,
  label: RegExp
): { remainder: string; value: string | null } {
  const match = raw.match(label);
  if (!match?.[1]) return { remainder: raw.trim(), value: null };
  const value = match[1].trim();
  const remainder = raw
    .replace(match[0], " ")
    .replace(/\s*\|\s*\|\s*/g, " | ")
    .replace(/^\s*\|\s*|\s*\|\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { remainder, value: value || null };
}

export function quoteContactFooterLines(company: {
  address?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
}): QuoteFooterLines {
  let address = (company.address || "").trim();
  let email = (company.email || "").trim();
  let website = (company.website || "").trim();

  // If address was stored as one joined footer string, split digital bits out.
  const fromEmail = peelContactField(
    address,
    /(?:^|\|\s*)Email:\s*([^|]+)/i
  );
  address = fromEmail.remainder;
  if (!email && fromEmail.value) email = fromEmail.value;

  const fromWeb = peelContactField(
    address,
    /(?:^|\|\s*)Website:\s*([^|]+)/i
  );
  address = fromWeb.remainder;
  if (!website && fromWeb.value) website = fromWeb.value;

  if (/^Address:\s*/i.test(address)) {
    address = address.replace(/^Address:\s*/i, "").trim();
  }

  const primary = [
    address ? `Address: ${address}` : null,
    company.phone ? `PH: ${company.phone}` : null,
    company.mobile ? `Mobile: ${company.mobile}` : null,
  ].filter(Boolean);
  const digital = [
    email ? `Email: ${email}` : null,
    website ? `Website: ${website}` : null,
  ].filter(Boolean);

  return {
    line1: primary.length > 0 ? primary.join(" | ") : null,
    line2: digital.length > 0 ? digital.join(" | ") : null,
  };
}

/** @deprecated Prefer quoteContactFooterLines for two-line footer layout. */
export function quoteContactFooterLine(company: {
  address?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  website?: string;
}): string {
  const { line1, line2 } = quoteContactFooterLines(company);
  return [line1, line2].filter(Boolean).join(" | ");
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
