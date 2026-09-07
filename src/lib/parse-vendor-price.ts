/**
 * Extract a likely unit price (INR) from a vendor reply email body.
 * Picks the largest plausible amount when multiple numbers appear.
 */
export function parseVendorQuotedPrice(text: string): number | null {
  const candidates: number[] = [];
  const patterns = [
    /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /\b([\d,]+(?:\.\d{1,2})?)\s*(?:\/-)?\s*(?:per\s*(?:unit|pc|pcs|piece))?/gi,
    /(?:price|quote|rate|cost)\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const value = Number(match[1].replace(/,/g, ""));
      if (Number.isFinite(value) && value >= 100 && value <= 50_000_000) {
        candidates.push(value);
      }
    }
  }

  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

export const THREAD_REF_PATTERN = /\[REF:([A-Z0-9-]+)\]/i;

export function extractThreadRef(text: string): string | null {
  const match = text.match(THREAD_REF_PATTERN);
  return match?.[1]?.toUpperCase() || null;
}
