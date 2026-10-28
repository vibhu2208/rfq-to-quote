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
    parts.push(`Discount: -${formatQuoteAmount(input.discountAmount)}`);
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

export function todayQuoteDateIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Display quotation date as dd/MM/yyyy from a yyyy-MM-dd value. */
export function formatQuoteDateDisplay(iso?: string | null): string {
  const datePart = (iso || todayQuoteDateIso()).slice(0, 10);
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return datePart;
  return `${d}/${m}/${y}`;
}

export function parseQuoteDate(iso?: string | null): Date | null {
  const datePart = iso?.trim().slice(0, 10);
  if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const d = new Date(`${datePart}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatQuoteQty(qty: number, unit: string): string {
  const raw = (unit || "NOS").trim();
  const u =
    /^(pc|pcs|piece|pieces)$/i.test(raw) || raw.toLowerCase() === "nos"
      ? "NOS"
      : raw.toUpperCase();
  const q = Number.isInteger(qty) ? String(qty) : String(qty);
  return `${q} ${u}`;
}

export const DEFAULT_QUOTE_TAGLINE = "ENABLING IT   |   ISO 9001:2015";
export const DEFAULT_QUOTE_SERVICES =
  "Computer Hardware & Software, Electrical & Electronic Kits, Networking, Corporate Training. Customized Software Solutions, Mobile App Development, E-Commerce Solutions, Plagiarism Checker";

export const QUOTE_CLOSING =
  "We look forward to your favorable response to our proposal. We trust that you will find our offer competitive and would be pleased to receive your valued order. Should you require any further information or clarification, please feel free to contact us. We are committed to delivering the best products and services to your organization and assure you of our highest level of service at all times.";
