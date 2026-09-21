import type { RfqRequirementItem } from "@/lib/rfq-items";

export type VendorQuotedLineItem = {
  lineNumber: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
};

const INDIAN_UNIT_MULT: Record<string, number> = {
  crore: 10_000_000,
  cr: 10_000_000,
  lakh: 100_000,
  lac: 100_000,
  thousand: 1_000,
  k: 1_000,
};

function normalizeIndianUnit(raw: string): string {
  const u = raw.toLowerCase().replace(/s$/, "");
  if (u === "crs" || u === "cr") return "crore";
  if (u === "lacs" || u === "lac") return "lakh";
  return u;
}

/**
 * Parse Indian-style spoken/written amounts, e.g.:
 * - "4 lakh 28 thousand" → 428000
 * - "4lakh 28 thousand" → 428000
 * - "4.28 lakh" → 428000
 * - "1 crore 50 lakh" → 15000000
 */
export function parseIndianWordAmount(text: string): number | null {
  const s = text
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/\blacs?\b/g, "lakh")
    .replace(/\bcrores?\b/g, "crore")
    .replace(/\bcrs?\b/g, "crore");

  const tokenRe =
    /(\d+(?:\.\d+)?)\s*(crore|cr|lakh|lac|thousand|k)\b/gi;
  const tokens: Array<{ value: number; mult: number; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(s)) !== null) {
    const value = Number(match[1]);
    const unit = normalizeIndianUnit(match[2]);
    const mult = INDIAN_UNIT_MULT[unit];
    if (!Number.isFinite(value) || value <= 0 || !mult) continue;
    tokens.push({ value, mult, index: match.index });
  }

  if (tokens.length === 0) return null;

  // Cluster consecutive tokens into one amount (gap ≤ 24 chars).
  let best: number | null = null;
  let i = 0;
  while (i < tokens.length) {
    let sum = tokens[i].value * tokens[i].mult;
    let j = i + 1;
    let end = tokens[i].index + 20;
    while (j < tokens.length && tokens[j].index <= end + 24) {
      // Place values should decrease (crore → lakh → thousand)
      if (tokens[j].mult >= tokens[j - 1].mult) break;
      sum += tokens[j].value * tokens[j].mult;
      end = tokens[j].index + 20;
      j += 1;
    }
    // Trailing residual digits after the last unit, e.g. "4 lakh 500"
    if (j > i) {
      const after = s.slice(end);
      const residual = after.match(
        /^\s*(\d{1,3})(?!\s*(?:crore|cr|lakh|lac|thousand|k)\b)/
      );
      if (residual && tokens[j - 1].mult >= 1000) {
        const extra = Number(residual[1]);
        if (Number.isFinite(extra) && extra > 0 && extra < tokens[j - 1].mult) {
          sum += extra;
        }
      }
    }
    if (Number.isFinite(sum) && sum >= 1 && sum <= 50_000_000) {
      best = best == null ? sum : Math.max(best, sum);
    }
    i = Math.max(j, i + 1);
  }

  return best;
}

function looksLikeLineTotalPhrase(text: string): boolean {
  return /\b(total|altogether|for\s+all|grand\s*total|the\s+price\s+(will\s+be|is|comes?\s+to)|price\s+will\s+be|amount\s+(is|will\s+be))\b/i.test(
    text
  );
}

function looksLikeUnitPricePhrase(text: string): boolean {
  return /\b(per\s*(unit|pc|pcs|piece|monitor|item)|each|\/\s*(unit|pc|pcs|piece)|unit\s*price|rate\s+per)\b/i.test(
    text
  );
}

/**
 * Extract a likely unit price (INR) from a vendor reply email body.
 * Prefers an explicit total when present; otherwise picks the largest
 * plausible single amount (legacy single-product replies).
 */
export function parseVendorQuotedPrice(text: string): number | null {
  const indian = parseIndianWordAmount(text);
  if (indian != null) return indian;

  const totalMatch = text.match(
    /(?:grand\s*)?total\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i
  );
  if (totalMatch) {
    const value = Number(totalMatch[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value >= 1 && value <= 50_000_000) {
      return value;
    }
  }

  const candidates: number[] = [];
  const patterns = [
    /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /(?:price|quote|rate|cost|unit\s*price)\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const value = Number(match[1].replace(/,/g, ""));
      if (Number.isFinite(value) && value >= 1 && value <= 50_000_000) {
        candidates.push(value);
      }
    }
  }

  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

function parseMoney(raw: string): number | null {
  const indian = parseIndianWordAmount(raw);
  if (indian != null) return indian;
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value) || value < 1 || value > 50_000_000) return null;
  return value;
}

function normalizeDesc(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidItemLine(
  lineNumber: number,
  items: RfqRequirementItem[]
): boolean {
  return items.some((item) => item.lineNumber === lineNumber);
}

/**
 * When vendor gives one lump amount for a single requested line with qty > 1,
 * decide whether that amount is a line total or a unit price.
 */
function resolveSingleLineAmount(
  amount: number,
  quantity: number,
  replyText: string
): { unitPrice: number; lineTotal: number } {
  const qty = quantity > 0 ? quantity : 1;
  if (qty <= 1) {
    return { unitPrice: amount, lineTotal: amount };
  }
  if (looksLikeUnitPricePhrase(replyText)) {
    return { unitPrice: amount, lineTotal: amount * qty };
  }
  // Indian word amounts + "the price will be…" are usually basket/line totals.
  if (
    looksLikeLineTotalPhrase(replyText) ||
    parseIndianWordAmount(replyText) === amount
  ) {
    const unitPrice = Math.round((amount / qty) * 100) / 100;
    return { unitPrice, lineTotal: amount };
  }
  return { unitPrice: amount, lineTotal: amount * qty };
}

/**
 * Parse per-line unit prices from a vendor reply, aligned to RFQ items.
 * Supports:
 * - "1. Product — ₹1,200"
 * - "Item 2: 4500"
 * - "CCTV Camera: Rs. 2500 / unit"
 * - "4 lakh 28 thousand" (Indian word amounts)
 * - Ordered price list when line numbers are missing
 */
export function parseVendorLinePrices(
  text: string,
  items: RfqRequirementItem[]
): { lines: VendorQuotedLineItem[]; total: number | null } {
  if (items.length === 0) {
    const single = parseVendorQuotedPrice(text);
    return { lines: [], total: single };
  }

  const byLine = new Map<number, number>();
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const numbered = trimmed.match(
      /^(?:item\s*)?(\d+)[.):\-\s]+(.+?)(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/\s*(?:unit|pc|pcs|piece))?/i
    );
    if (numbered) {
      const lineNumber = Number(numbered[1]);
      const price = parseMoney(numbered[3]);
      if (isValidItemLine(lineNumber, items) && price != null) {
        byLine.set(lineNumber, price);
        continue;
      }
    }

    // Numbered line with Indian word amount: "4. monitors — 4 lakh 28 thousand"
    const numberedIndian = trimmed.match(
      /^(?:item\s*)?(\d+)[.):\-\s]+(.+)$/i
    );
    if (numberedIndian) {
      const lineNumber = Number(numberedIndian[1]);
      const indian = parseIndianWordAmount(numberedIndian[2]);
      if (isValidItemLine(lineNumber, items) && indian != null) {
        byLine.set(lineNumber, indian);
        continue;
      }
    }

    for (const item of items) {
      if (byLine.has(item.lineNumber)) continue;
      const desc = normalizeDesc(item.description);
      if (desc.length < 3) continue;
      const lineNorm = normalizeDesc(trimmed);
      const descTokens = desc.split(" ").filter((t) => t.length >= 3);
      const overlap =
        descTokens.length > 0 &&
        descTokens.filter((t) => lineNorm.includes(t)).length >=
          Math.min(2, descTokens.length);
      if (!overlap && !lineNorm.includes(desc.slice(0, Math.min(desc.length, 24)))) {
        continue;
      }
      const indian = parseIndianWordAmount(trimmed);
      if (indian != null) {
        byLine.set(item.lineNumber, indian);
        continue;
      }
      const priceMatch = trimmed.match(
        /(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/\s*(?:unit|pc|pcs|piece))?/i
      );
      if (!priceMatch) continue;
      const price = parseMoney(priceMatch[1]);
      if (price != null) byLine.set(item.lineNumber, price);
    }
  }

  // Fall back: collect prices in order for remaining lines
  if (byLine.size < items.length) {
    const orderedPrices: number[] = [];
    const indian = parseIndianWordAmount(text);
    if (indian != null) orderedPrices.push(indian);

    const pricePattern =
      /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)|(?:^|\s)([\d,]+(?:\.\d{1,2})?)\s*(?:\/-)?\s*(?:per\s*(?:unit|pc|pcs|piece))?/gi;
    let match: RegExpExecArray | null;
    while ((match = pricePattern.exec(text)) !== null) {
      const price = parseMoney(match[1] || match[2]);
      if (price != null && !orderedPrices.includes(price)) orderedPrices.push(price);
    }

    // Also accept plain numbered lines ending with a price: "1. ... 45000"
    for (const line of lines) {
      const plain = line.trim().match(
        /^(?:item\s*)?(\d+)[.)]\s+.+?\s+(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)\s*$/i
      );
      if (!plain) continue;
      const lineNumber = Number(plain[1]);
      const price = parseMoney(plain[2]);
      if (
        isValidItemLine(lineNumber, items) &&
        price != null &&
        !byLine.has(lineNumber)
      ) {
        byLine.set(lineNumber, price);
      }
    }

    let priceIdx = 0;
    for (const item of items) {
      if (byLine.has(item.lineNumber)) continue;
      while (
        priceIdx < orderedPrices.length &&
        [...byLine.values()].includes(orderedPrices[priceIdx])
      ) {
        priceIdx += 1;
      }
      if (priceIdx >= orderedPrices.length) break;
      byLine.set(item.lineNumber, orderedPrices[priceIdx]);
      priceIdx += 1;
    }
  }

  const quotedLines: VendorQuotedLineItem[] = items
    .filter((item) => byLine.has(item.lineNumber))
    .map((item) => {
      const rawAmount = byLine.get(item.lineNumber)!;
      const quantity = item.quantity || 1;
      // Single-line replies often quote a basket total in Indian words.
      if (items.length === 1) {
        const resolved = resolveSingleLineAmount(rawAmount, quantity, text);
        return {
          lineNumber: item.lineNumber,
          description: item.description,
          quantity,
          unit: item.unit,
          unitPrice: resolved.unitPrice,
          lineTotal: resolved.lineTotal,
        };
      }
      return {
        lineNumber: item.lineNumber,
        description: item.description,
        quantity,
        unit: item.unit,
        unitPrice: rawAmount,
        lineTotal: rawAmount * quantity,
      };
    });

  if (quotedLines.length === 0) {
    const single = parseVendorQuotedPrice(text);
    if (single != null && items.length === 1) {
      const item = items[0];
      const quantity = item.quantity || 1;
      const resolved = resolveSingleLineAmount(single, quantity, text);
      return {
        lines: [
          {
            lineNumber: item.lineNumber,
            description: item.description,
            quantity,
            unit: item.unit,
            unitPrice: resolved.unitPrice,
            lineTotal: resolved.lineTotal,
          },
        ],
        total: resolved.lineTotal,
      };
    }
    return { lines: [], total: single };
  }

  const sum = quotedLines.reduce((acc, line) => acc + line.lineTotal, 0);
  const explicitTotal = parseVendorQuotedPrice(
    text.match(/(?:grand\s*)?total[\s\S]{0,40}/i)?.[0] || ""
  );

  return {
    lines: quotedLines,
    total: explicitTotal ?? sum,
  };
}

export const THREAD_REF_PATTERN = /\[REF:([A-Z0-9-]+)\]/i;

export function extractThreadRef(text: string): string | null {
  const match = text.match(THREAD_REF_PATTERN);
  return match?.[1]?.toUpperCase() || null;
}
