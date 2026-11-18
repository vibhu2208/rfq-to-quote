import { INDIAN_STATES } from "@/lib/states";
import {
  normalizeWarrantyService,
  normalizeWarrantyUnit,
  type WarrantyService,
  type WarrantyUnit,
} from "@/lib/quote-warranty";

export type CommercialTerms = {
  paymentTerms: string;
  /** Empty means the quote does not state a validity. */
  validity: string;
  /** Empty means delivery was not specified. */
  delivery: string;
  extra: string[];
};

const PAYMENT_RE = /^payment terms:\s*(.*)$/i;
const VALIDITY_RE = /^validity:\s*(.*)$/i;
const DELIVERY_RE = /^delivery:\s*(.*)$/i;

export function parseCommercialTerms(
  termsText: string | null | undefined,
  fallbackPayment = "Against Delivery"
): CommercialTerms {
  const lines = String(termsText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let paymentTerms = "";
  let validity = "";
  let delivery = "";
  const extra: string[] = [];
  for (const line of lines) {
    const payment = line.match(PAYMENT_RE);
    if (payment) {
      paymentTerms = payment[1].trim();
      continue;
    }
    const validityMatch = line.match(VALIDITY_RE);
    if (validityMatch) {
      validity = normalizeNotSpecified(validityMatch[1]);
      continue;
    }
    const deliveryMatch = line.match(DELIVERY_RE);
    if (deliveryMatch) {
      delivery = normalizeNotSpecified(deliveryMatch[1]);
      continue;
    }
    extra.push(line);
  }
  return {
    paymentTerms: paymentTerms || fallbackPayment,
    validity,
    delivery,
    extra,
  };
}

function normalizeNotSpecified(raw: string): string {
  const value = raw.trim();
  if (!value || /^not specified$/i.test(value)) return "";
  return value;
}

export function composeCommercialTerms(terms: CommercialTerms): string {
  const lines = [
    `Payment Terms: ${terms.paymentTerms.trim() || "Against Delivery"}`,
    `Validity: ${terms.validity.trim() || "Not specified"}`,
    `Delivery: ${terms.delivery.trim() || "Not specified"}`,
    ...terms.extra.map((line) => line.trim()).filter(Boolean),
  ];
  return lines.join("\n");
}

export type WarrantyAsk = {
  qty: number;
  unit: WarrantyUnit;
  service: WarrantyService;
};

/** Pull a warranty duration from RFQ text. Returns null when none is stated. */
export function extractWarrantyAsk(text: string | null | undefined): WarrantyAsk | null {
  const source = String(text ?? "");
  if (!source.trim()) return null;
  const match = source.match(
    /(\d+(?:\.\d+)?)\s*-?\s*(year|years|yr|yrs|month|months|mon|day|days)\b/i
  );
  if (!match) {
    if (!/\bwarranty\b/i.test(source)) return null;
    return null;
  }
  const qty = Math.round(Number(match[1]));
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const unit = normalizeWarrantyUnit(match[2]);
  let service: WarrantyService = "";
  if (/\bon-?site\b/i.test(source) && /\boff-?site\b/i.test(source)) service = "both";
  else if (/\bon-?site\b/i.test(source)) service = "onsite";
  else if (/\boff-?site\b/i.test(source)) service = "offsite";
  else service = normalizeWarrantyService("");
  return { qty: Math.min(9999, qty), unit, service };
}

export function rfqMentionsWarranty(text: string | null | undefined): boolean {
  return /\bwarranty\b/i.test(String(text ?? ""));
}

/** Longest Indian state name found in free text, if any. */
export function extractIndianState(text: string | null | undefined): string | null {
  const haystack = String(text ?? "").toLowerCase();
  if (!haystack.trim()) return null;
  const ordered = [...INDIAN_STATES].sort((a, b) => b.length - a.length);
  for (const state of ordered) {
    if (haystack.includes(state.toLowerCase())) return state;
  }
  return null;
}
