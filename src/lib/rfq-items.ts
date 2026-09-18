/** One product requirement extracted from an RFQ message. */
export type RfqRequirementItem = {
  lineNumber: number;
  description: string;
  quantity: number;
  unit: string;
  brand?: string | null;
  category?: string | null;
};

function asString(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

function normalizeItem(raw: unknown, lineNumber: number): RfqRequirementItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;

  const brand = asString(item.brand) || null;
  const description =
    asString(item.description) ||
    asString(item.productName) ||
    asString(item.name) ||
    "";
  const model = asString(item.model);
  const quantity = asNumber(item.quantity, 1);
  const unit = asString(item.unit) || "pcs";
  const category = asString(item.category) || null;

  const parts = [brand, description, model].filter(Boolean);
  const finalDescription = parts.join(" ").trim();
  if (!finalDescription) return null;

  return {
    lineNumber,
    description: finalDescription,
    quantity,
    unit,
    brand,
    category,
  };
}

/**
 * Read structured requirement lines from parsedSpecs.
 * Supports new `items[]` arrays and legacy single-product specs.
 * When rawText is provided, recovers bulleted lists from the original message
 * if AI collapsed multiple products into one summary line.
 */
export function extractRfqItems(parsedSpecs: unknown, rawText?: string): RfqRequirementItem[] {
  if (!parsedSpecs || typeof parsedSpecs !== "object") {
    return rawText ? extractRequirementsFromText(rawText) : [];
  }
  const specs = parsedSpecs as Record<string, unknown>;

  const rawItems = specs.items;
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    const fromSpecs = rawItems
      .map((item, i) => normalizeItem(item, i + 1))
      .filter((item): item is RfqRequirementItem => item != null);

    if (fromSpecs.length >= 2) return fromSpecs;

    if (rawText) {
      const fromText = extractRequirementsFromText(rawText);
      if (fromText.length >= 2) return fromText;
      if (fromSpecs.length === 1 && looksLikeMergedSummary(fromSpecs[0].description)) {
        return fromText.length > 0 ? fromText : fromSpecs;
      }
    }

    if (fromSpecs.length === 1) return fromSpecs;
  }

  const brand = asString(specs.brand) || null;
  const description = asString(specs.description);
  const quantity = asNumber(specs.quantity, 1);
  const unit = asString(specs.unit) || "pcs";
  const parts = [brand, description].filter(Boolean);
  const finalDescription = parts.join(" ").trim();

  if (rawText) {
    const fromText = extractRequirementsFromText(rawText);
    if (fromText.length >= 2) return fromText;
    if (finalDescription && looksLikeMergedSummary(finalDescription) && fromText.length > 0) {
      return fromText;
    }
  }

  if (!finalDescription) return rawText ? extractRequirementsFromText(rawText) : [];

  return [
    {
      lineNumber: 1,
      description: finalDescription,
      quantity,
      unit,
      brand,
      category: null,
    },
  ];
}

export function requirementSearchText(item: RfqRequirementItem): string {
  return [item.brand, item.description].filter(Boolean).join(" ");
}

/** Bullet / numbered line: "• CCTV Cameras – 10 Units" */
const BULLET_QTY_LINE =
  /^\s*(?:[•●◦▪▫\-*]|\d+[.)])\s*(.+?)\s*[–—\-:]\s*(\d+(?:[.,]\d+)?)\s*(units?|pcs|pieces?|nos|sets?|boxes?|pairs?|each|qty)?\.?\s*$/i;

/** Same pattern without leading bullet (indented sub-lines). */
const PLAIN_QTY_LINE =
  /^\s*(.+?)\s*[–—\-:]\s*(\d+(?:[.,]\d+)?)\s*(units?|pcs|pieces?|nos|sets?|boxes?|pairs?|each|qty)?\.?\s*$/i;

/** "Product name x 10" or "Product name (10 pcs)" */
const INLINE_QTY_LINE =
  /^\s*(?:[•●◦▪▫\-*]|\d+[.)])?\s*(.+?)\s*(?:x|\(|qty\s*)(\d+(?:[.,]\d+)?)\s*(units?|pcs|pieces?|nos)?\)?\.?\s*$/i;

function normalizeUnit(raw: string | undefined): string {
  if (!raw) return "pcs";
  const u = raw.toLowerCase().replace(/\./g, "");
  if (u === "unit" || u === "units" || u === "nos" || u === "each") return "pcs";
  if (u === "piece" || u === "pieces" || u === "pc" || u === "pcs") return "pcs";
  if (u === "set" || u === "sets") return "set";
  if (u === "box" || u === "boxes") return "box";
  if (u === "pair" || u === "pairs") return "pair";
  return u;
}

function parseQty(raw: string): number {
  const n = Number(raw.replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseLine(line: string): Omit<RfqRequirementItem, "lineNumber"> | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 4) return null;

  let match = trimmed.match(BULLET_QTY_LINE);
  if (match) {
    return {
      description: match[1].trim(),
      quantity: parseQty(match[2]),
      unit: normalizeUnit(match[3]),
      brand: null,
      category: null,
    };
  }

  match = trimmed.match(INLINE_QTY_LINE);
  if (match && !/quotation|requirement|following|products?/i.test(match[1])) {
    return {
      description: match[1].trim(),
      quantity: parseQty(match[2]),
      unit: normalizeUnit(match[3]),
      brand: null,
      category: null,
    };
  }

  match = trimmed.match(PLAIN_QTY_LINE);
  if (match && !/quotation|requirement|following|products?|greetings|regards/i.test(match[1])) {
    const desc = match[1].trim();
    if (desc.length >= 3 && desc.length <= 120) {
      return {
        description: desc,
        quantity: parseQty(match[2]),
        unit: normalizeUnit(match[3]),
        brand: null,
        category: null,
      };
    }
  }

  return null;
}

/**
 * Deterministic extraction for structured lists in email/text RFQs.
 * Handles bullets (•), dashes, and numbered lines with qty + unit.
 */
export function extractRequirementsFromText(rawText: string): RfqRequirementItem[] {
  if (!rawText.trim()) return [];

  const lines = rawText.split(/\r?\n/);
  const items: RfqRequirementItem[] = [];

  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed) {
      items.push({ ...parsed, lineNumber: items.length + 1 });
    }
  }

  return items;
}

/** True when AI collapsed many products into one summary line. */
export function looksLikeMergedSummary(description: string): boolean {
  const lower = description.toLowerCase();
  if (/\b(including|such as|following|comprising)\b/.test(lower)) return true;
  const commas = (description.match(/,/g) || []).length;
  const ands = (lower.match(/\band\b/g) || []).length;
  return description.length > 60 && (commas >= 2 || ands >= 2);
}

type LooseItem = {
  description?: string | null;
  brand?: string | null;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
};

/** Prefer structured text lines over a collapsed AI summary. */
export function resolveParsedItems(
  aiItems: LooseItem[],
  rawText: string
): LooseItem[] {
  const textItems = extractRequirementsFromText(rawText);

  const normalizedAi = aiItems
    .filter((item) => asString(item.description) || asString(item.brand))
    .map((item) => ({
      description: asString(item.description) || asString(item.brand) || null,
      brand: asString(item.brand) || null,
      quantity: typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : null,
      unit: asString(item.unit) || null,
      category: asString(item.category) || null,
    }));

  if (textItems.length >= 2) {
    return textItems.map((item) => ({
      description: item.description,
      brand: item.brand ?? null,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category ?? null,
    }));
  }

  if (normalizedAi.length >= 2) return normalizedAi;

  if (normalizedAi.length === 1) {
    const desc = normalizedAi[0].description || "";
    if (textItems.length === 1 && looksLikeMergedSummary(desc)) {
      return textItems.map((item) => ({
        description: item.description,
        brand: item.brand ?? null,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category ?? null,
      }));
    }
    if (looksLikeMergedSummary(desc) && textItems.length >= 1) {
      return textItems.map((item) => ({
        description: item.description,
        brand: item.brand ?? null,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category ?? null,
      }));
    }
  }

  if (normalizedAi.length === 1) return normalizedAi;
  if (textItems.length === 1) {
    return textItems.map((item) => ({
      description: item.description,
      brand: item.brand ?? null,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category ?? null,
    }));
  }

  return normalizedAi;
}
