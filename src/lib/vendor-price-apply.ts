import type { VendorQuotedLineItem } from "@/lib/parse-vendor-price";

/** Remove quoted history / signatures so price parsers don't read years, %, or REF ids as prices. */
export function stripEmailQuotedHistory(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (/^on .+wrote:\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*original message\s*-{2,}/i.test(line.trim())) break;
    if (/^from:\s+/i.test(line.trim()) && kept.length > 0) break;
    if (/^>/.test(line)) continue;
    kept.push(line);
  }
  return kept.join("\n").trim();
}

export function lineItemsLookPlausible(
  lines: VendorQuotedLineItem[],
  opts?: { minUnitPrice?: number; expectCount?: number }
): boolean {
  if (lines.length === 0) return false;
  const minUnit = opts?.minUnitPrice ?? 50;
  if (opts?.expectCount != null && lines.length < Math.min(2, opts.expectCount)) {
    return false;
  }
  for (const line of lines) {
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < minUnit) return false;
    // Years / REF fragments often parse as prices
    if (line.unitPrice >= 2000 && line.unitPrice <= 2100 && Number.isInteger(line.unitPrice)) {
      return false;
    }
    if (line.unitPrice > 0 && line.unitPrice <= 100 && line.quantity >= 5) {
      // Likely a % or line number mistaken as unit price for multi-qty B2B goods
      if (line.unitPrice <= 30) return false;
    }
  }
  return true;
}

type DiscountRule = {
  percent: number;
  /** Lowercased keywords; empty = applies to "other"/remaining lines */
  match: string[];
  other?: boolean;
};

function parseDiscountRules(text: string): DiscountRule[] {
  const rules: DiscountRule[] = [];
  const lower = text
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*percent/g, "$1%")
    .replace(/(\d+(?:\.\d+)?)\s*per\s*cent/g, "$1%");

  // "10% on enterprise servers" / "reduction of 10% on the price of the enterprise servers"
  const specific =
    /(\d+(?:\.\d+)?)\s*%[^.\n]{0,60}?(?:on|for|of)\s+(?:the\s+)?(?:price\s+of\s+(?:the\s+)?)?([a-z0-9][\w\s/-]{2,60}?)(?:\.|,|;|and|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = specific.exec(lower)) !== null) {
    const percent = Number(match[1]);
    const raw = match[2]
      .replace(/\b(price|quoted|current|item|product|unit|services?|service)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) continue;
    if (!raw || raw.length < 3) continue;
    if (/\bother\b/.test(raw)) {
      rules.push({ percent, match: [], other: true });
    } else {
      rules.push({
        percent,
        match: raw.split(/\s+/).filter((t) => t.length >= 3),
      });
    }
  }

  // "enterprise servers price reduced by 10%"
  const reverse =
    /([a-z][\w\s/-]{2,40}?)\s+(?:price\s+)?(?:reduced|reduction|discount|less|off)\s+by\s+(\d+(?:\.\d+)?)\s*%/gi;
  while ((match = reverse.exec(lower)) !== null) {
    const percent = Number(match[2]);
    const raw = match[1]
      .replace(/\b(the|a|an|want|have|need)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) continue;
    if (/\bother\b/.test(raw)) {
      rules.push({ percent, match: [], other: true });
    } else if (raw.length >= 3) {
      rules.push({
        percent,
        match: raw.split(/\s+/).filter((t) => t.length >= 3),
      });
    }
  }

  // "3% less on the other services" / "other service to be 3% less"
  const otherPatterns = [
    /(\d+(?:\.\d+)?)\s*%[^.\n]{0,50}?\bother\b/,
    /\bother\b[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*%/,
    /\bother\b[^.\n]{0,40}?(\d+(?:\.\d+)?)\s*%?\s*(?:less|off|reduction)/,
  ];
  for (const pattern of otherPatterns) {
    const otherMatch = lower.match(pattern);
    if (!otherMatch) continue;
    const percent = Number(otherMatch[1]);
    if (Number.isFinite(percent) && percent > 0 && percent < 100) {
      rules.push({ percent, match: [], other: true });
      break;
    }
  }

  // Global / vendor-offered: "7% discount", "give you the 7% discount", "10% off"
  const globalPatterns = [
    /(\d+(?:\.\d+)?)\s*%\s*(?:discount|off|less|reduction)\b/,
    /(?:discount|off|reduction|less)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/,
    /(?:give|giving|offer|offering|provide|providing|will\s+do|can\s+do|lets?\s+do)[^.\n%]{0,40}?(\d+(?:\.\d+)?)\s*%/,
    /(\d+(?:\.\d+)?)\s*%[^.\n]{0,20}?\b(?:discount|off)\b/,
  ];
  for (const pattern of globalPatterns) {
    const globalMatch = lower.match(pattern);
    if (!globalMatch) continue;
    const percent = Number(globalMatch[1]);
    if (Number.isFinite(percent) && percent > 0 && percent < 100) {
      rules.push({ percent, match: [], other: true });
      break;
    }
  }

  const seen = new Set<string>();
  return rules.filter((rule) => {
    const key = `${rule.percent}:${rule.other ? "other" : rule.match.join("-")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function lineMatchesKeywords(description: string, keywords: string[]): boolean {
  const desc = description.toLowerCase();
  if (keywords.length === 0) return false;
  const hits = keywords.filter((kw) => desc.includes(kw));
  return hits.length >= Math.min(2, keywords.length) || hits.some((kw) => kw.length >= 6);
}

/**
 * When a vendor accepts a negotiation without listing new numbers, apply the
 * requested / offered % discounts to the previous line prices.
 *
 * Prefer % stated in the vendor reply (e.g. "I will give you 7% discount")
 * over % asked in the admin negotiation note.
 */
export function applyAcceptedNegotiationDiscounts(input: {
  previousLines: VendorQuotedLineItem[];
  negotiationNote: string;
  negotiationEmailBody?: string;
  /** Latest vendor reply — often where they state the discount they will give. */
  vendorReplyText?: string;
}): { lines: VendorQuotedLineItem[]; total: number } | null {
  const previous = input.previousLines.filter((l) => l.unitPrice > 0);
  if (!lineItemsLookPlausible(previous, { minUnitPrice: 100 })) return null;

  const vendorBlob = input.vendorReplyText || "";
  const adminBlob = `${input.negotiationNote}\n${input.negotiationEmailBody || ""}`;
  // Vendor-stated discount wins when present; otherwise use what we asked for.
  const vendorRules = parseDiscountRules(vendorBlob);
  const adminRules = parseDiscountRules(adminBlob);
  const rules = vendorRules.length > 0 ? vendorRules : adminRules;
  if (rules.length === 0) return null;

  const specificRules = rules.filter((r) => !r.other && r.match.length > 0);
  const blanketRule = rules.find((r) => r.other) || null;

  const lines = previous.map((line) => {
    let percent: number | null = null;
    for (const rule of specificRules) {
      if (lineMatchesKeywords(line.description, rule.match)) {
        percent = rule.percent;
        break;
      }
    }
    if (percent == null && blanketRule) percent = blanketRule.percent;
    if (percent == null && specificRules.length === 1 && previous.length === 1) {
      percent = specificRules[0].percent;
    }
    // Single global % with no product keywords → apply to every line
    if (
      percent == null &&
      specificRules.length === 0 &&
      rules.length === 1 &&
      rules[0].match.length === 0
    ) {
      percent = rules[0].percent;
    }
    if (percent == null) {
      return {
        ...line,
        lineTotal: Math.round(line.unitPrice * line.quantity * 100) / 100,
      };
    }
    const unitPrice = Math.round(line.unitPrice * (1 - percent / 100) * 100) / 100;
    return {
      ...line,
      unitPrice,
      lineTotal: Math.round(unitPrice * line.quantity * 100) / 100,
    };
  });

  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return { lines, total: Math.round(total * 100) / 100 };
}

/**
 * Prefer previous plausible line items when the newly extracted prices look like noise.
 */
export function preferPlausibleLinePrices(input: {
  previous: VendorQuotedLineItem[];
  next: VendorQuotedLineItem[];
  expectCount?: number;
}): VendorQuotedLineItem[] {
  const prevOk = lineItemsLookPlausible(input.previous, {
    minUnitPrice: 100,
    expectCount: input.expectCount,
  });
  const nextOk = lineItemsLookPlausible(input.next, {
    minUnitPrice: 100,
    expectCount: input.expectCount,
  });
  if (nextOk) return input.next;
  if (prevOk) return input.previous;
  return input.next.length > 0 ? input.next : input.previous;
}
