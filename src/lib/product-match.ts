import type { Product } from "@prisma/client";
import { decimalToNumber } from "@/lib/quotes";
import {
  extractRfqItems,
  requirementSearchText,
  type RfqRequirementItem,
} from "@/lib/rfq-items";

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
  "product",
  "service",
  "team",
  "web",
  "general",
  "uncategorized",
  // Too common across catalog rows — alone they invent false matches
  "inch",
  "inches",
  "mm",
  "cm",
  "meter",
  "metres",
  "meters",
  "black",
  "white",
  "new",
  "ke",
  "ka",
  "ki",
  "ek",
  "hai",
  "hain",
]);

/** One solid name/code token hit — below this we hide suggestions. */
const MIN_MATCH_SCORE = 6;

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
      // Values only — schema keys like "brand"/"model" pollute keyword matching
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

/**
 * Exact match, or safe plural/stem (monitors↔monitor).
 * Rejects weak substring traps like displays⊃dp or monitors⊃mon.
 */
export function tokensLooselyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  const [longer, shorter] = a.length >= b.length ? [a, b] : [b, a];
  if (!longer.startsWith(shorter)) return false;
  return longer.length - shorter.length <= 2;
}

export function extractKeywords(input: {
  parsedCategory?: string | null;
  parsedSpecs?: unknown;
  subject?: string;
  rawText?: string;
}): string[] {
  const parts: string[] = [];
  // Do NOT include parsedCategory here — words like "Monitors" falsely match MON-* products
  // when the AI miscategorizes (e.g. "Control Panel Enclosures" → Monitors & Displays).
  if (input.subject) parts.push(input.subject);
  parts.push(...flattenValues(input.parsedSpecs));
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

function scorePool(
  pool: Product[],
  keywords: string[],
  kwSet: Set<string>,
  rfqBlob: string,
  parsedCategory: string | null | undefined
): ProductMatch[] {
  const scored: ProductMatch[] = [];

  for (const p of pool) {
    const nameTokens = tokenize(p.name);
    const codeTokens = tokenize(p.code);
    const descTokens = tokenize(p.description);
    const haystack = [...nameTokens, ...codeTokens, ...descTokens];
    const haySet = new Set(haystack);
    const matchedTokens: string[] = [];
    let score = 0;

    for (const kw of keywords) {
      if (haySet.has(kw)) {
        matchedTokens.push(kw);
        if (nameTokens.includes(kw)) score += 6;
        else if (codeTokens.includes(kw)) score += 5;
        else score += 2;
        continue;
      }

      const nameHit = nameTokens.find((h) => tokensLooselyMatch(h, kw));
      if (nameHit) {
        matchedTokens.push(kw);
        score += 5;
        continue;
      }
      const codeHit = codeTokens.find((h) => tokensLooselyMatch(h, kw));
      if (codeHit) {
        matchedTokens.push(kw);
        score += 4;
        continue;
      }
      const descHit = descTokens.find((h) => tokensLooselyMatch(h, kw));
      if (descHit) {
        matchedTokens.push(kw);
        score += 1;
      }
    }

    const nameLower = p.name.toLowerCase().trim();
    if (nameLower.length >= 3 && rfqBlob.includes(nameLower)) {
      score += 24;
      matchedTokens.push(...nameTokens);
    } else if (nameTokens.length > 0) {
      const nameHits = nameTokens.filter(
        (t) => kwSet.has(t) || keywords.some((kw) => tokensLooselyMatch(t, kw))
      );
      if (nameHits.length === nameTokens.length && nameTokens.length >= 2) {
        score += 16;
        matchedTokens.push(...nameHits);
      } else if (nameHits.length >= Math.ceil(nameTokens.length * 0.6) && nameHits.length >= 2) {
        score += 8;
        matchedTokens.push(...nameHits);
      }
    }

    // Category is only a tie-breaker after a real content match — never enough alone
    if (
      score >= MIN_MATCH_SCORE &&
      parsedCategory &&
      parsedCategory !== "General / Uncategorized" &&
      productInCategory(p.code, parsedCategory)
    ) {
      score += 1;
    }

    if (score >= MIN_MATCH_SCORE) {
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
  return scored;
}

/**
 * Score active products against parsed RFQ keywords.
 * No AI — token overlap on code/name/description.
 * Parsed category is a score bonus only (never a hard filter), so a wrong
 * AI category cannot hide the right catalog product or invent false matches.
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
  if (keywords.length === 0) return [];
  const kwSet = new Set(keywords);

  const active = products.filter((p) => p.active);
  const rfqBlob = [input.subject, input.rawText, ...flattenValues(input.parsedSpecs)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const scored = scorePool(active, keywords, kwSet, rfqBlob, input.parsedCategory);
  return scored.slice(0, limit);
}

export type RequirementMatch = {
  lineNumber: number;
  requirement: RfqRequirementItem;
  keywords: string[];
  matches: ProductMatch[];
};

function matchRequirementItem(
  products: Product[],
  item: RfqRequirementItem,
  fallbackCategory: string | null | undefined,
  limit: number
): { keywords: string[]; matches: ProductMatch[] } {
  const searchText = requirementSearchText(item);
  const parsedSpecs = {
    brand: item.brand,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    specs: {},
  };

  const keywords = extractKeywords({
    parsedSpecs,
    rawText: searchText,
  });

  if (keywords.length === 0) {
    return { keywords: [], matches: [] };
  }

  const kwSet = new Set(keywords);
  const active = products.filter((p) => p.active);
  const rfqBlob = searchText.toLowerCase();
  const category = item.category || fallbackCategory;
  const matches = scorePool(active, keywords, kwSet, rfqBlob, category).slice(0, limit);

  return { keywords, matches };
}

/**
 * Match each RFQ requirement line independently so multi-product RFQs
 * surface one catalog match per requested product.
 */
export function matchProductsToRfqItems(
  products: Product[],
  input: {
    parsedCategory?: string | null;
    parsedSpecs?: unknown;
    subject?: string;
    rawText?: string;
  },
  limitPerItem = 4
): RequirementMatch[] {
  const items = extractRfqItems(input.parsedSpecs);
  if (items.length === 0) return [];

  return items.map((requirement) => {
    const { keywords, matches } = matchRequirementItem(
      products,
      requirement,
      input.parsedCategory,
      limitPerItem
    );
    return {
      lineNumber: requirement.lineNumber,
      requirement,
      keywords,
      matches,
    };
  });
}

/** Flatten per-line matches, deduped by product id (keeps highest score). */
export function flattenRequirementMatches(itemMatches: RequirementMatch[]): ProductMatch[] {
  const byId = new Map<string, ProductMatch>();
  for (const item of itemMatches) {
    for (const match of item.matches) {
      const existing = byId.get(match.product.id);
      if (!existing || match.score > existing.score) {
        byId.set(match.product.id, match);
      }
    }
  }
  return [...byId.values()].sort(
    (a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name)
  );
}
