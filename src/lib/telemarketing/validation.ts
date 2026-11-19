import { normalizePhone } from "@/lib/telemarketing/import";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function validatePhoneInput(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: "" };
  }
  const digits = normalizePhone(trimmed);
  if (!digits) {
    return { ok: false, error: "Phone must be 7–15 digits" };
  }
  return { ok: true, value: digits };
}

export function validateEmailInput(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: "" };
  }
  const lower = trimmed.toLowerCase();
  if (!EMAIL_RE.test(lower)) {
    return { ok: false, error: "Enter a valid email address" };
  }
  return { ok: true, value: lower };
}

export function contactRequiresPhoneOrEmail(phone: string, email: string) {
  return Boolean(phone.trim() || email.trim());
}