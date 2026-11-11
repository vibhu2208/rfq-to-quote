import type { Product } from "@prisma/client";
import { decimalToNumber } from "@/lib/quotes";
import { catalogSellPrice } from "@/lib/product-price";
import {
  extractRfqItems,
  requirementSearchText,
  type RfqRequirementItem,
} from "@/lib/rfq-items";
import { PRODUCT_CATEGORIES, isUncategorizedCategory } from "@/lib/categories";

/** Map AI/parsed category → product code prefixes (deterministic, no AI). */
export const CATEGORY_CODE_PREFIXES: Record<string, string[]> = {
  CCTV: ["CCTV-"],
  "CAMERA- Philips-": ["CCTV-", "CAM-"],
  DESKTOP: ["PC-", "DESK-"],
  LAPTOP: ["LAP-", "NB-"],
  TFT: ["MON-", "TFT-"],
  "LED Display Samsung": ["MON-", "LED-"],
  "INTERACTIVE PANELS": ["PANEL-", "IFP-"],
  HDD: ["HDD-"],
  SSD: ["SSD-"],
  RAM: ["RAM-"],
  NETWORKING: ["SW-", "NET-"],
  "NETWORKING -SYROTECH": ["SW-", "NET-"],
  CABLE: ["CAB-"],
  Cisco: ["CISCO-", "SW-"],
  UPS: ["UPS-"],
  BATTERY: ["BAT-"],
  "AMARON BATTERIES": ["BAT-", "AMARON-"],
  PRINTER: ["PRT-", "PRN-"],
  SCANNER: ["SCN-"],
  SERVER: ["SRV-"],
  "LENOVO SERVER": ["SRV-"],
  Services: ["SVC-"],
  Misc: [],
};

/** Extra type synonyms not obvious from category labels alone. */
const TYPE_SYNONYMS = [
  "ifp",
  "interactive",
  "panel",
  "panels",
  "smartboard",
  "laptop",
  "laptops",
  "notebook",
  "notebooks",
  "desktop",
  "desktops",
  "printer",
  "printers",
  "cartridge",
  "cartridges",
  "toner",
  "cctv",
  "camera",
  "cameras",
  "surveillance",
  "monitor",
  "monitors",
  "display",
  "displays",
  "server",
  "servers",
  "ups",
  "battery",
  "batteries",
  "switch",
  "router",
  "cable",
  "cables",
  "patchcord",
  "patchcords",
  "patchcable",
  "patchcables",
  "patchpanel",
  "patchpanels",
  "cord",
  "cords",
  "poe",
  "ssd",
  "hdd",
  "ram",
  "scanner",
  "projectors",
  "projector",
];

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
  "warranty",
  "years",
  "year",
  "installation",
  "inbuild",
  "inbuilt",
  "upgradable",
  "oem",
  "gen",
  "core",
  "octa",
  "android",
]);

/** Brand-tier weight (% points). */
export const WEIGHT_BRAND = 35;
/** Category / product-type tier weight. */
export const WEIGHT_TYPE = 25;
/** Floor / ceiling for IDF-derived weights. */
const IDF_WEIGHT_MIN = 5;
const IDF_WEIGHT_MAX = 18;

/** Minimum weighted score to keep a candidate (allows a single IDF/type hit). */
const MIN_MATCH_SCORE = IDF_WEIGHT_MIN;

/**
 * Auto-bind threshold for RFQ → quote. Below this (or on type/spec conflict)
 * leave the line unbound so the user picks from suggestions.
 */
export const MIN_AUTO_BIND_SCORE = 22;

/** Retrieval window before AI re-rank. */
export const CATALOG_RETRIEVAL_LIMIT = 20;

/** UI / quote suggestion width after re-rank. */
export const CATALOG_SUGGESTION_LIMIT = 4;

export type CatalogTypeFamily =
  | "monitor"
  | "display"
  | "cable"
  | "patch_cord"
  | "patch_panel"
  | "ups"
  | "switch"
  | null;

export type MatchConstraints = {
  screenInches: number | null;
  cableMeters: number | null;
  capacityKva: number | null;
  portCount: number | null;
  wantsPoe: boolean | null;
  typeFamily: CatalogTypeFamily;
};

/** Structured specs used as hard filters (beyond bag-of-words). */
export function extractMatchConstraints(text: string): MatchConstraints {
  const t = String(text || "").toLowerCase();

  const screenInches = (() => {
    const m = t.match(/\b(\d{2}(?:\.\d+)?)\s*(?:-?\s*)?(?:inch(?:es)?|in\b|")\b/);
    if (m) return Number(m[1]);
    // Avoid treating "24-port" as a 24" display.
    if (/\b\d+\s*-?\s*ports?\b/.test(t)) return null;
    const m2 = t.match(
      /\b(\d{2}(?:\.\d+)?)\s+(?:fhd|uhd|qhd|ips|led|lcd)?\s*(?:monitor|display|tv)\b/
    );
    return m2 ? Number(m2[1]) : null;
  })();

  const cableMeters = (() => {
    if (
      !/\b(patch\s*cords?|patch\s*cables?|cat\s*[56]|hdmi\s*cables?|network\s*cables?|lan\s*cables?)\b/.test(
        t
      )
    ) {
      return null;
    }
    const m = t.match(/\b(\d+(?:\.\d+)?)\s*(?:m|mtr|meter|metre|meters|metres)\b/);
    return m ? Number(m[1]) : null;
  })();

  const capacityKva = (() => {
    const kva = t.match(/\b(\d+(?:\.\d+)?)\s*kva\b/);
    if (kva) return Number(kva[1]);
    const va = t.match(/\b(\d+(?:\.\d+)?)\s*va\b/);
    return va ? Number(va[1]) / 1000 : null;
  })();

  const portCount = (() => {
    const m = t.match(/\b(\d{1,3})\s*-?\s*ports?\b/);
    return m ? Number(m[1]) : null;
  })();

  const wantsPoe = /\bpoe\b/.test(t) ? true : null;

  const typeFamily: CatalogTypeFamily = (() => {
    if (/\bpatch\s*panels?\b/.test(t)) return "patch_panel";
    if (/\bpatch\s*cords?\b|\bpatch\s*cables?\b/.test(t)) return "patch_cord";
    if (/\bmonitors?\b|\btft\b/.test(t)) return "monitor";
    if (
      /\b(?:led\s*)?displays?\b/.test(t) &&
      !/\bdisplay\s*port\b/.test(t) &&
      !/\bmonitors?\b/.test(t)
    ) {
      return "display";
    }
    if (/\bups\b/.test(t)) return "ups";
    if (/\bswitches?\b/.test(t)) return "switch";
    if (/\bcat\s*[56]\b|\bcables?\b|\bcords?\b/.test(t)) return "cable";
    return null;
  })();

  return {
    screenInches,
    cableMeters,
    capacityKva,
    portCount,
    wantsPoe,
    typeFamily,
  };
}

const TYPE_CONFLICTS: Record<string, CatalogTypeFamily[]> = {
  monitor: ["cable", "patch_cord", "patch_panel", "switch", "ups"],
  display: ["cable", "patch_cord", "patch_panel", "switch", "ups", "monitor"],
  cable: ["monitor", "display", "ups", "switch", "patch_panel"],
  patch_cord: ["monitor", "display", "ups", "switch", "patch_panel"],
  patch_panel: ["monitor", "display", "ups", "patch_cord", "cable"],
  ups: ["monitor", "display", "cable", "patch_cord", "patch_panel", "switch"],
  switch: ["monitor", "display", "cable", "patch_cord", "patch_panel", "ups"],
};

export function constraintsConflict(
  req: MatchConstraints,
  product: MatchConstraints
): boolean {
  if (
    req.typeFamily &&
    product.typeFamily &&
    TYPE_CONFLICTS[req.typeFamily]?.includes(product.typeFamily)
  ) {
    return true;
  }

  if (
    req.screenInches != null &&
    product.screenInches != null &&
    Math.abs(req.screenInches - product.screenInches) >= 1
  ) {
    return true;
  }

  if (
    req.cableMeters != null &&
    product.cableMeters != null &&
    Math.abs(req.cableMeters - product.cableMeters) > 0.05
  ) {
    return true;
  }

  // Qty-like "50 CAT6" must not bind to a 50" panel just because of the number.
  if (
    req.cableMeters != null &&
    (product.typeFamily === "monitor" || product.typeFamily === "display")
  ) {
    return true;
  }
  if (
    (req.typeFamily === "patch_cord" ||
      req.typeFamily === "cable" ||
      req.typeFamily === "patch_panel") &&
    product.screenInches != null &&
    (product.typeFamily === "monitor" || product.typeFamily === "display")
  ) {
    return true;
  }

  if (
    req.capacityKva != null &&
    product.capacityKva != null &&
    Math.abs(req.capacityKva - product.capacityKva) > 0.05
  ) {
    return true;
  }

  if (
    req.portCount != null &&
    product.portCount != null &&
    req.portCount !== product.portCount
  ) {
    return true;
  }

  // RFQ asked for PoE but product has no PoE signal.
  if (req.wantsPoe === true && product.wantsPoe !== true) {
    return true;
  }

  return false;
}

function constraintScoreBonus(req: MatchConstraints, product: MatchConstraints): number {
  let bonus = 0;
  if (req.typeFamily && req.typeFamily === product.typeFamily) bonus += 12;
  if (req.screenInches != null && req.screenInches === product.screenInches) bonus += 10;
  if (req.cableMeters != null && product.cableMeters != null) bonus += 8;
  if (req.capacityKva != null && product.capacityKva != null) bonus += 10;
  if (req.portCount != null && req.portCount === product.portCount) bonus += 8;
  if (req.wantsPoe === true && product.wantsPoe === true) bonus += 6;
  return bonus;
}

/** Soft demotion when product adds PoE/size extras the RFQ never asked for. */
function constraintScorePenalty(req: MatchConstraints, product: MatchConstraints): number {
  let score = 1;
  if (req.wantsPoe == null && product.wantsPoe === true && req.typeFamily === "switch") {
    score *= 0.45;
  }
  return score;
}


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
      flattenValues(v, out);
    }
  }
  return out;
}

/** Split text into searchable tokens (lowercase, alphanumeric chunks). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Normalize common interface spellings before compound splits.
    .replace(/display[\s_-]*port/g, "displayport")
    .replace(/usb[\s_-]*c\b/g, "usbc")
    .replace(/patch\s*cords?/g, "patchcord")
    .replace(/patch\s*panels?/g, "patchpanel")
    .replace(/patch\s*cables?/g, "patchcable")
    // "HDMI+DisplayPort" / "HDMI/DP" must become separate tokens.
    .replace(/([a-z0-9])[+/&]+([a-z0-9])/g, "$1 $2")
    .replace(/[^a-z0-9.]+/gi, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

/** Canonical video/data ports used as hard match constraints. */
export function canonicalizePortToken(token: string): string | null {
  const t = token.toLowerCase().trim();
  if (t === "dp" || t === "displayport") return "displayport";
  if (t === "hdmi") return "hdmi";
  if (t === "vga") return "vga";
  if (t === "dvi") return "dvi";
  if (t === "usbc" || t === "typec") return "usbc";
  return null;
}

export function extractVideoPorts(tokens: Iterable<string>): Set<string> {
  const ports = new Set<string>();
  for (const token of tokens) {
    const port = canonicalizePortToken(token);
    if (port) ports.add(port);
  }
  return ports;
}

/**
 * Exact match, or safe plural/stem (monitors↔monitor).
 * Rejects weak substring traps like displays⊃dp or monitors⊃mon.
 */
export function tokensLooselyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const portA = canonicalizePortToken(a);
  const portB = canonicalizePortToken(b);
  if (portA && portB && portA === portB) return true;
  if (a.length < 4 || b.length < 4) return false;
  const [longer, shorter] = a.length >= b.length ? [a, b] : [b, a];
  if (!longer.startsWith(shorter)) return false;
  return longer.length - shorter.length <= 2;
}

function haystackHasToken(hayTokens: Set<string>, word: string): boolean {
  if (hayTokens.has(word)) return true;
  for (const t of hayTokens) {
    if (tokensLooselyMatch(t, word)) return true;
  }
  return false;
}

export function extractKeywords(input: {
  parsedCategory?: string | null;
  parsedSpecs?: unknown;
  subject?: string;
  rawText?: string;
}): string[] {
  const parts: string[] = [];
  // Do NOT include parsedCategory here — wrong AI category pollutes keywords.
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
    lastPrice: number | null;
    taxRate: number;
    brand?: string | null;
    category?: string | null;
    modelNo?: string | null;
  };
  score: number;
  matchedTokens: string[];
};

export function shouldAutoBindCatalogMatch(
  match: Pick<ProductMatch, "score" | "product"> | null | undefined,
  requirementText: string
): boolean {
  if (!match || match.score < MIN_AUTO_BIND_SCORE) return false;
  const req = extractMatchConstraints(requirementText);
  const product = extractMatchConstraints(
    `${match.product.name} ${match.product.description || ""}`
  );
  return !constraintsConflict(req, product);
}

/** Quote-editor warning when bound catalog contradicts the RFQ line wording. */
export function catalogBindingLooksMismatched(
  requirementText: string,
  productText: string
): boolean {
  const req = extractMatchConstraints(requirementText);
  const product = extractMatchConstraints(productText);
  if (constraintsConflict(req, product)) return true;
  if (req.wantsPoe == null && product.wantsPoe === true && req.typeFamily === "switch") {
    return true;
  }
  return false;
}

function toProductMatch(p: Product, score: number, matchedTokens: string[]): ProductMatch {
  return {
    product: {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      unit: p.unit,
      offerPrice: catalogSellPrice(p),
      lastPrice: decimalToNumber(p.lastPrice) || null,
      taxRate: decimalToNumber(p.taxRate),
      brand: p.brand,
      category: p.category,
      modelNo: p.modelNo,
    },
    score,
    matchedTokens,
  };
}

function catalogIdentityCodes(p: Product): string[] {
  return [p.code, p.sourceProductId, p.modelNo, p.partNo, p.popularCode, p.commCode]
    .filter((v): v is string => Boolean(v && String(v).trim()))
    .map((v) => v.trim().toLowerCase());
}

type IndexedProduct = {
  product: Product;
  tokens: Set<string>;
  nameTokens: string[];
  identityTokens: Set<string>;
  brandTokens: Set<string>;
  categoryTokens: Set<string>;
};

export type CatalogMatchContext = {
  products: IndexedProduct[];
  brandLexicon: Set<string>;
  typeLexicon: Set<string>;
  /** token → document frequency across catalog */
  df: Map<string, number>;
  nDocs: number;
};

function buildTypeLexicon(): Set<string> {
  const out = new Set<string>();
  for (const cat of PRODUCT_CATEGORIES) {
    for (const t of tokenize(cat)) out.add(t);
  }
  for (const s of TYPE_SYNONYMS) out.add(s.toLowerCase());
  return out;
}

/**
 * Build brand / type lexicons + IDF stats from the active catalog.
 * Brand = Product.brand values (plus any parsed brands passed later).
 * Type = taxonomy category tokens + synonyms.
 */
export function buildCatalogMatchContext(products: Product[]): CatalogMatchContext {
  const active = products.filter((p) => p.active);
  const brandLexicon = new Set<string>();
  const typeLexicon = buildTypeLexicon();
  const df = new Map<string, number>();
  const indexed: IndexedProduct[] = [];

  for (const p of active) {
    const brandParts = tokenize(p.brand || "");
    for (const b of brandParts) brandLexicon.add(b);

    const nameTokens = tokenize(p.name);
    const identity = tokenize(
      [p.code, p.modelNo, p.partNo, p.popularCode, p.commCode].filter(Boolean).join(" ")
    );
    const categoryTokens = tokenize([p.category, p.subCategory].filter(Boolean).join(" "));
    const descTokens = tokenize((p.description || "").slice(0, 280));
    const all = [...nameTokens, ...identity, ...brandParts, ...categoryTokens, ...descTokens];
    const tokenSet = new Set(all);

    for (const t of tokenSet) {
      df.set(t, (df.get(t) || 0) + 1);
    }

    indexed.push({
      product: p,
      tokens: tokenSet,
      nameTokens,
      identityTokens: new Set(identity),
      brandTokens: new Set(brandParts),
      categoryTokens: new Set(categoryTokens),
    });
  }

  return {
    products: indexed,
    brandLexicon,
    typeLexicon,
    df,
    nDocs: Math.max(indexed.length, 1),
  };
}

function idfWeight(token: string, ctx: CatalogMatchContext): number {
  const df = ctx.df.get(token) || 0;
  const idf = Math.log((ctx.nDocs + 1) / (df + 1)) + 1;
  const scaled = Math.round(idf * 5);
  return Math.min(IDF_WEIGHT_MAX, Math.max(IDF_WEIGHT_MIN, scaled));
}

/**
 * Per-requirement-word weight:
 * stopwords already removed by tokenize;
 * catalog brand → highest; category/type → high; else IDF rarity.
 */
export function wordWeight(
  token: string,
  ctx: CatalogMatchContext,
  extraBrands: Set<string> = new Set()
): number {
  if (STOP_WORDS.has(token)) return 0;
  if (ctx.brandLexicon.has(token) || extraBrands.has(token)) return WEIGHT_BRAND;
  if (ctx.typeLexicon.has(token)) return WEIGHT_TYPE;
  return idfWeight(token, ctx);
}

function isFeatureNoiseCandidate(
  indexed: IndexedProduct,
  reqTokenCount: number,
  matchedTokens: string[],
  ctx: CatalogMatchContext,
  extraBrands: Set<string>
): boolean {
  if (reqTokenCount < 8) return false;
  if (indexed.nameTokens.length === 0 || indexed.nameTokens.length > 2) return false;
  // Short catalog name whose only hits are non-brand words on a long RFQ
  const onlyWeak = matchedTokens.every(
    (t) => !ctx.brandLexicon.has(t) && !extraBrands.has(t) && !indexed.brandTokens.has(t)
  );
  return onlyWeak && matchedTokens.length <= 2;
}

function scoreIndexedProduct(
  indexed: IndexedProduct,
  keywords: string[],
  weights: Map<string, number>,
  ctx: CatalogMatchContext,
  extraBrands: Set<string>,
  parsedBrand: string | null | undefined,
  parsedCategory: string | null | undefined,
  constraintText?: string
): ProductMatch | null {
  const matchedTokens: string[] = [];
  let score = 0;

  for (const kw of keywords) {
    const w = weights.get(kw) || 0;
    if (w <= 0) continue;
    if (!haystackHasToken(indexed.tokens, kw)) continue;
    matchedTokens.push(kw);
    // Prefer identity/name hits slightly within the same word weight
    if (indexed.nameTokens.some((t) => t === kw || tokensLooselyMatch(t, kw))) {
      score += w;
    } else if (haystackHasToken(indexed.identityTokens, kw) || haystackHasToken(indexed.brandTokens, kw)) {
      score += w;
    } else if (haystackHasToken(indexed.categoryTokens, kw)) {
      score += Math.round(w * 0.85);
    } else {
      score += Math.round(w * 0.55); // description-only
    }
  }

  const brandToks = tokenize(parsedBrand || "");
  if (brandToks.length > 0) {
    const brandHit = brandToks.every(
      (b) =>
        haystackHasToken(indexed.brandTokens, b) ||
        haystackHasToken(indexed.tokens, b)
    );
    if (brandHit) score += 30;
  }

  if (
    parsedCategory &&
    !isUncategorizedCategory(parsedCategory) &&
    indexed.product.category &&
    indexed.product.category.toLowerCase() === parsedCategory.toLowerCase()
  ) {
    score += 10;
  }

  // Hard constraint: required ports on the RFQ must appear on the product.
  // VGA must never satisfy a DisplayPort requirement (and vice versa).
  const requiredPorts = extractVideoPorts(keywords);
  if (requiredPorts.size > 0) {
    const productPorts = extractVideoPorts(indexed.tokens);
    for (const port of requiredPorts) {
      if (!productPorts.has(port)) return null;
    }
    score += requiredPorts.size * 8;
  }

  const reqText =
    constraintText ||
    [parsedBrand, parsedCategory, ...keywords].filter(Boolean).join(" ");
  const productText = [indexed.product.name, indexed.product.description || ""].join(" ");
  const reqConstraints = extractMatchConstraints(reqText);
  const productConstraints = extractMatchConstraints(productText);
  if (constraintsConflict(reqConstraints, productConstraints)) return null;
  score += constraintScoreBonus(reqConstraints, productConstraints);
  score = Math.round(score * constraintScorePenalty(reqConstraints, productConstraints));

  if (isFeatureNoiseCandidate(indexed, keywords.length, matchedTokens, ctx, extraBrands)) {
    score = Math.round(score * 0.2);
  }

  if (score < MIN_MATCH_SCORE || matchedTokens.length === 0) return null;
  return toProductMatch(indexed.product, score, [...new Set(matchedTokens)]);
}

function ensureBrandCandidates(
  scored: ProductMatch[],
  ctx: CatalogMatchContext,
  brandTokens: string[],
  limit: number
): ProductMatch[] {
  if (brandTokens.length === 0) return scored.slice(0, limit);
  const seen = new Set(scored.map((m) => m.product.id));
  const extras: ProductMatch[] = [];

  for (const indexed of ctx.products) {
    if (seen.has(indexed.product.id)) continue;
    const hit = brandTokens.some(
      (b) => haystackHasToken(indexed.brandTokens, b) || haystackHasToken(indexed.tokens, b)
    );
    if (!hit) continue;
    extras.push(toProductMatch(indexed.product, WEIGHT_BRAND, brandTokens));
    seen.add(indexed.product.id);
    if (scored.length + extras.length >= limit) break;
  }

  return [...scored, ...extras].slice(0, limit);
}

/**
 * Weighted retrieval over the full catalog (brand / type / IDF).
 * Returns top `limit` candidates for AI re-rank.
 */
export function retrieveCatalogCandidates(
  ctx: CatalogMatchContext,
  input: {
    keywords: string[];
    parsedBrand?: string | null;
    parsedCategory?: string | null;
    constraintText?: string | null;
  },
  limit = CATALOG_RETRIEVAL_LIMIT
): ProductMatch[] {
  const keywords = [...new Set(input.keywords.filter(Boolean))];
  if (keywords.length === 0) return [];

  const extraBrands = new Set(tokenize(input.parsedBrand || ""));
  const weights = new Map<string, number>();
  for (const kw of keywords) {
    weights.set(kw, wordWeight(kw, ctx, extraBrands));
  }

  const scored: ProductMatch[] = [];
  for (const indexed of ctx.products) {
    const match = scoreIndexedProduct(
      indexed,
      keywords,
      weights,
      ctx,
      extraBrands,
      input.parsedBrand,
      input.parsedCategory,
      input.constraintText || undefined
    );
    if (match) scored.push(match);
  }

  scored.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
  return ensureBrandCandidates(scored, ctx, [...extraBrands], limit);
}

function scorePoolWithContext(
  ctx: CatalogMatchContext,
  keywords: string[],
  parsedBrand: string | null | undefined,
  parsedCategory: string | null | undefined,
  limit: number,
  constraintText?: string | null
): ProductMatch[] {
  return retrieveCatalogCandidates(
    ctx,
    { keywords, parsedBrand, parsedCategory, constraintText },
    limit
  );
}

/**
 * Score active products against parsed RFQ keywords (weighted retrieval).
 * No AI — brand / type / IDF overlap. Category is a bonus, never a hard filter.
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
  const ctx = buildCatalogMatchContext(products);
  const specs = (input.parsedSpecs || {}) as { brand?: string | null };
  return scorePoolWithContext(ctx, keywords, specs.brand, input.parsedCategory, limit);
}

export type RequirementMatch = {
  lineNumber: number;
  requirement: RfqRequirementItem;
  keywords: string[];
  matches: ProductMatch[];
};

function matchRequirementItem(
  ctx: CatalogMatchContext,
  item: RfqRequirementItem,
  fallbackCategory: string | null | undefined,
  limit: number
): { keywords: string[]; matches: ProductMatch[] } {
  const searchText = requirementSearchText(item);
  const parsedSpecs = {
    brand: item.brand,
    model: item.model,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    specs: {},
  };

  const keywords = extractKeywords({
    parsedSpecs,
    rawText: searchText,
  });
  const code = (item.code || "").trim().toLowerCase();
  const exact = code
    ? ctx.products
        .filter((p) => catalogIdentityCodes(p.product).includes(code))
        .map((p) => toProductMatch(p.product, 1000, [item.code || p.product.code]))
    : [];

  if (keywords.length === 0) {
    return { keywords: exact.length ? [code] : [], matches: exact.slice(0, limit) };
  }

  const category = item.category || fallbackCategory;
  const scored = scorePoolWithContext(
    ctx,
    keywords,
    item.brand,
    category,
    limit,
    searchText
  );
  const seen = new Set(exact.map((m) => m.product.id));
  const matches = [...exact, ...scored.filter((m) => !seen.has(m.product.id))].slice(0, limit);

  return { keywords, matches };
}

/**
 * Match each RFQ requirement line independently.
 * Default limit is the retrieval window (20) for hybrid AI re-rank.
 */
export function matchProductsToRfqItems(
  products: Product[],
  input: {
    parsedCategory?: string | null;
    parsedSpecs?: unknown;
    subject?: string;
    rawText?: string;
  },
  limitPerItem = CATALOG_RETRIEVAL_LIMIT
): RequirementMatch[] {
  const items = extractRfqItems(input.parsedSpecs, input.rawText);
  if (items.length === 0) return [];

  const ctx = buildCatalogMatchContext(products);
  return items.map((requirement) => {
    const { keywords, matches } = matchRequirementItem(
      ctx,
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

/** Reorder a line's matches by an ordered id list (AI). Unmentioned keep relative order at end. */
export function applyRerankOrder(
  matches: ProductMatch[],
  orderedIds: string[],
  limit = CATALOG_SUGGESTION_LIMIT
): ProductMatch[] {
  if (orderedIds.length === 0) return matches.slice(0, limit);
  const byId = new Map(matches.map((m) => [m.product.id, m]));
  const out: ProductMatch[] = [];
  for (const id of orderedIds) {
    const m = byId.get(id);
    if (m) {
      out.push(m);
      byId.delete(id);
    }
  }
  return out.slice(0, limit);
}
