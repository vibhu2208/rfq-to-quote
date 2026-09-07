import type { Product } from "@prisma/client";
import { decimalToNumber } from "@/lib/quotes";

/** Map AI/parsed category → product code prefixes (deterministic, no AI). */
export const CATEGORY_CODE_PREFIXES: Record<string, string[]> = {
  "CCTV & Surveillance": ["CCTV-"],
  "Computers & Laptops": ["PC-", "LAP-"],
  "Monitors & Displays": ["MON-"],
  "Storage (HDD / SSD)": ["HDD-", "SSD-"],
  "Memory (RAM)": ["RAM-"],
  "Networking & Cables": ["SW-", "CAB-"],
  "UPS & Power": ["UPS-"],
  "Installation & Service": ["SVC-"],
  "General / Uncategorized": [],
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "with",
  "from",
  "to",
  "of",
  "in",
  "on",
  "at",
  "is",
  "are",
  "need",
  "needed",
  "want",
  "looking",
  "please",
  "quote",
  "rfq",
  "pcs",
  "piece",
  "pieces",
  "qty",
  "quantity",
  "about",
  "around",
  "ke",
  "ka",
  "ki",
  "ek",
  "hai",
  "hain",
]);

function flattenValues(value: unknown, out: string[] = []): string[] {
  if (value == null) return out;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenValues(item, out);
    return out;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "_meta") {
        const meta = v as { summary?: string };
        if (meta?.summary) out.push(meta.summary);
        continue;
      }
      out.push(k);
      flattenValues(v, out);
    }
  }
  return out;
}

/** Split text into searchable tokens (lowercase, alphanumeric chunks). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.+]+/gi, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

export function extractKeywords(input: {
  parsedCategory?: string | null;
  parsedSpecs?: unknown;
  subject?: string;
  rawText?: string;
}): string[] {
  const parts: string[] = [];
  if (input.parsedCategory) parts.push(input.parsedCategory);
  if (input.subject) parts.push(input.subject);
  parts.push(...flattenValues(input.parsedSpecs));
  // Light touch of raw text for extra tokens (capped)
  if (input.rawText) parts.push(input.rawText.slice(0, 500));

  const tokens = tokenize(parts.join(" "));
  return [...new Set(tokens)];
}

export type ProductMatch = {
  product: {
    id: string;
    code: string;
    name: string;
    description: string;
    unit: string;
    offerPrice: number;
    taxRate: number;
  };
  score: number;
  matchedTokens: string[];
};

function productInCategory(code: string, category: string | null | undefined): boolean {
  if (!category || category === "General / Uncategorized") return true;
  const prefixes = CATEGORY_CODE_PREFIXES[category];
  if (!prefixes || prefixes.length === 0) return true;
  return prefixes.some((p) => code.toUpperCase().startsWith(p.toUpperCase()));
}

/**
 * Score active products against parsed RFQ keywords.
 * No AI — category filter + token overlap on code/name/description.
 */
export function matchProductsToRfq(
  products: Product[],
  input: {
    parsedCategory?: string | null;
    parsedSpecs?: unknown;
    subject?: string;
    rawText?: string;
  },
  limit = 8
): ProductMatch[] {
  const keywords = extractKeywords(input);
  if (keywords.length === 0 && !input.parsedCategory) return [];

  const scoped = products.filter(
    (p) => p.active && productInCategory(p.code, input.parsedCategory)
  );
  // If category filter emptied the list, fall back to all active
  const pool = scoped.length > 0 ? scoped : products.filter((p) => p.active);

  const scored: ProductMatch[] = [];

  for (const p of pool) {
    const haystack = tokenize(`${p.code} ${p.name} ${p.description}`);
    const haySet = new Set(haystack);
    const matchedTokens: string[] = [];
    let score = 0;

    for (const kw of keywords) {
      if (haySet.has(kw)) {
        matchedTokens.push(kw);
        // Code tokens weigh more
        if (tokenize(p.code).includes(kw)) score += 6;
        else if (tokenize(p.name).includes(kw)) score += 4;
        else score += 2;
        continue;
      }
      // Partial / contains (e.g. "2mp" in "2mp", "32inch" ~ "32")
      const partial = haystack.find((h) => h.includes(kw) || kw.includes(h));
      if (partial && kw.length >= 3) {
        matchedTokens.push(kw);
        score += 1;
      }
    }

    // Category prefix bonus when category is specific
    if (
      input.parsedCategory &&
      input.parsedCategory !== "General / Uncategorized" &&
      productInCategory(p.code, input.parsedCategory)
    ) {
      score += 1;
    }

    if (score > 0) {
      scored.push({
        product: {
          id: p.id,
          code: p.code,
          name: p.name,
          description: p.description,
          unit: p.unit,
          offerPrice: decimalToNumber(p.offerPrice),
          taxRate: decimalToNumber(p.taxRate),
        },
        score,
        matchedTokens: [...new Set(matchedTokens)],
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
  return scored.slice(0, limit);
}
