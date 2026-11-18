/** Empty while zero so typing `9` never becomes `09`. */
export function formatPercentInput(percent: number): string {
  if (!Number.isFinite(percent) || percent <= 0) return "";
  const rounded = Math.round(percent * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

/** Keep digits and one decimal; drop a leading zero (`09` → `9`). */
export function sanitizePercentDraft(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (cleaned === "") return "";
  const dot = cleaned.indexOf(".");
  if (dot === -1) {
    return String(Number(cleaned));
  }
  const whole = cleaned.slice(0, dot);
  const frac = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  const wholeNorm = whole === "" ? "" : String(Number(whole));
  if (cleaned.endsWith(".") && frac === "") {
    return `${wholeNorm || "0"}.`;
  }
  if (frac === "") return wholeNorm;
  return `${wholeNorm || "0"}.${frac}`;
}

/** Digits and a single decimal for a rupee amount. No leading-zero pad. */
export function sanitizeAmountDraft(raw: string): string {
  return sanitizePercentDraft(raw);
}
