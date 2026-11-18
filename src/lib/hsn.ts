const HSN_LENGTHS = new Set([2, 4, 6, 8]);

/** Digits only, at most 8. Letters are dropped. */
export function sanitizeHsnInput(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 8);
}

/** Blank is allowed while editing. Any other length is invalid. */
export function hsnFieldError(value: string): string | null {
  const digits = sanitizeHsnInput(value);
  if (!digits) return null;
  if (!HSN_LENGTHS.has(digits.length)) {
    return "HSN must be 2, 4, 6, or 8 digits";
  }
  return null;
}

export function isHsnMissingOrInvalid(value: string | null | undefined): boolean {
  const digits = sanitizeHsnInput(value || "");
  if (!digits) return true;
  return !HSN_LENGTHS.has(digits.length);
}
