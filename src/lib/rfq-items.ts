/** One product requirement extracted from an RFQ message. */
export type RfqRequirementItem = {
  lineNumber: number;
  description: string;
  quantity: number;
  unit: string;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
  code?: string | null;
  extraNotes?: string | null;
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
  const code =
    asString(item.code) || asString(item.sku) || asString(item.productCode) || null;
  const productName = asString(item.productName) || asString(item.name);
  const descriptionField = asString(item.description);
  const named = productName || descriptionField;
  const model = asString(item.model);
  const quantity = asNumber(item.quantity, 1);
  const unit = asString(item.unit);
  const category = asString(item.category) || null;
  const extraNotes =
    asString(item.extraNotes) ||
    asString(item.notes) ||
    (productName && descriptionField && descriptionField !== productName
      ? descriptionField
      : "");

  // Keep the wording the client wrote. Brand/model stay on the item for matching.
  const finalDescription = named || model || brand || code || "";
  if (!finalDescription) return null;

  return {
    lineNumber,
    description: finalDescription,
    quantity,
    unit: unit || "pcs",
    brand,
    model: model || null,
    category,
    code,
    extraNotes: extraNotes || null,
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
  return [item.brand, item.description, item.code].filter(Boolean).join(" ");
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
  if (u === "m" || u === "meter" || u === "meters" || u === "metre" || u === "metres") {
    return "meters";
  }
  return u;
}

const LENGTH_UNIT_SET = new Set([
  "m",
  "meter",
  "meters",
  "metre",
  "metres",
  "ft",
  "feet",
  "inch",
  "inches",
  "in",
  "cm",
  "mm",
]);

/**
 * `unit` must be how quantity is counted (usually pcs), not product length/size.
 * "Cat6 patch cable 2 m x40" → qty 40, unit pcs (length stays in the description).
 * "50 meters of Cat6" → qty 50, unit meters (sold by the metre).
 */
export function correctItemQuantityUnit(
  description: string | null | undefined,
  quantity: number | null | undefined,
  unit: string | null | undefined
): { quantity: number | null; unit: string | null } {
  const desc = String(description || "").trim();
  const qty =
    typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0
      ? quantity
      : null;
  const normalized = unit ? normalizeUnit(unit) : null;
  const rawUnit = String(unit || "")
    .toLowerCase()
    .replace(/\./g, "")
    .trim();

  if (!normalized || !LENGTH_UNIT_SET.has(rawUnit) && normalized !== "meters") {
    return { quantity: qty, unit: normalized };
  }

  const lengthMatch = desc.match(
    /\b(\d+(?:\.\d+)?)\s*(m|meters?|metres?|ft|feet|inch(?:es)?|in|cm|mm)\b/i
  );
  const lengthNum = lengthMatch ? Number(lengthMatch[1]) : NaN;
  const xCountMatch = desc.match(/\bx\s*(\d+(?:\.\d+)?)\b/i);
  const xCount = xCountMatch ? Number(xCountMatch[1]) : NaN;
  const countedPatch =
    /\b(patch\s*cables?|patch\s*cords?)\b/i.test(desc) ||
    /\bpre[- ]?terminated\b/i.test(desc);

  // Explicit "… 2 m x40" → count of pieces.
  if (Number.isFinite(xCount)) {
    return { quantity: qty ?? xCount, unit: "pcs" };
  }
  // Qty differs from an embedded length (2 m) → that length is a spec, not the unit.
  if (qty !== null && Number.isFinite(lengthNum) && qty !== lengthNum) {
    return { quantity: qty, unit: "pcs" };
  }
  // Finished patch leads are sold as pieces even when AI says "meters".
  if (countedPatch) {
    return { quantity: qty, unit: "pcs" };
  }

  return { quantity: qty, unit: normalized };
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

function withCorrectedUnit(item: LooseItem): LooseItem {
  const description = asString(item.description) || asString(item.brand) || null;
  const corrected = correctItemQuantityUnit(
    description,
    typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : null,
    asString(item.unit) || null
  );
  return {
    description,
    brand: asString(item.brand) || null,
    quantity: corrected.quantity,
    unit: corrected.unit,
    category: asString(item.category) || null,
  };
}

/** Prefer structured text lines over a collapsed AI summary. */
export function resolveParsedItems(
  aiItems: LooseItem[],
  rawText: string
): LooseItem[] {
  const textItems = extractRequirementsFromText(rawText).map((item) =>
    withCorrectedUnit({
      description: item.description,
      brand: item.brand ?? null,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category ?? null,
    })
  );

  const normalizedAi = aiItems
    .filter((item) => asString(item.description) || asString(item.brand))
    .map((item) => withCorrectedUnit(item));

  if (textItems.length >= 2) {
    return textItems;
  }

  if (normalizedAi.length >= 2) return normalizedAi;

  if (normalizedAi.length === 1) {
    const desc = normalizedAi[0].description || "";
    if (textItems.length === 1 && looksLikeMergedSummary(desc)) {
      return textItems;
    }
    if (looksLikeMergedSummary(desc) && textItems.length >= 1) {
      return textItems;
    }
  }

  if (normalizedAi.length === 1) return normalizedAi;
  if (textItems.length === 1) {
    return textItems;
  }

  return normalizedAi;
}
