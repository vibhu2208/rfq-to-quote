export type BuyerDetailInput = {
  buyerCompany?: string | null;
  buyerState?: string | null;
  buyerAddress?: string | null;
  buyerEmail?: string | null;
  buyerPhone?: string | null;
};

export type BuyerFieldKey = keyof BuyerDetailInput;

export type BuyerFieldErrors = Partial<Record<BuyerFieldKey, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidBuyerEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Keep an optional leading + and digits. Cap at 15 digits. */
export function sanitizePhoneInput(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "").slice(0, 15);
  return plus ? `+${digits}` : digits;
}

export function phoneFieldError(value: string): string | null {
  const phone = value.trim();
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!/^\+?\d+$/.test(phone) || digits.length < 10 || digits.length > 15) {
    return "Enter 10–15 digits, with an optional + prefix";
  }
  return null;
}

export function validateBuyerDetails(input: BuyerDetailInput): BuyerFieldErrors {
  const errors: BuyerFieldErrors = {};
  if (!input.buyerCompany?.trim()) {
    errors.buyerCompany = "Company name is required";
  }
  if (!input.buyerState?.trim()) {
    errors.buyerState = "State is required";
  }
  if (!input.buyerAddress?.trim()) {
    errors.buyerAddress = "Address is required";
  }
  const email = input.buyerEmail?.trim() || "";
  if (email && !isValidBuyerEmail(email)) {
    errors.buyerEmail = "Enter a valid email address";
  }
  const phoneError = phoneFieldError(input.buyerPhone || "");
  if (phoneError) errors.buyerPhone = phoneError;
  return errors;
}

export const BUYER_FIELD_FOCUS_ORDER: BuyerFieldKey[] = [
  "buyerCompany",
  "buyerState",
  "buyerAddress",
  "buyerEmail",
  "buyerPhone",
];
