export const QUOTE_NAVY = "#1F3A5F";
export const QUOTE_GRAY = "#666666";
export const QUOTE_MUTED_BG = "#F3F5F7";
export const QUOTE_LINE = "#D0D5DB";

export function formatQuoteAmount(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
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
