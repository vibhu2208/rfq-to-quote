/** Product / vendor taxonomy — matches catalog LeadCatName values. */
export const PRODUCT_CATEGORIES = [
  "ACCESSORIES",
  "AMARON BATTERIES",
  "ANTIVIRUS",
  "ATTENDANCE M/C",
  "BAG",
  "BATTERY",
  "BOARD",
  "CABLE",
  "CAMERA- Philips-",
  "CARTRIDGE",
  "CCTV",
  "Cisco",
  "Debit Note / Credit Note / Discount",
  "DESKTOP",
  "Electrical Goods",
  "Electronic Goods",
  "FIX ASSETS",
  "FURNITURE",
  "Hardware",
  "HDD",
  "HP SUPPLIES",
  "INTERACTIVE PANELS",
  "KEYBOARD",
  "LAPTOP",
  "LED Display Samsung",
  "LENOVO SERVER",
  "Misc",
  "MOUSE",
  "NETWORKING",
  "NETWORKING -SYROTECH",
  "old",
  "PENDRIVE",
  "PRINTER",
  "PROJECTOR",
  "RAM",
  "SCANNER",
  "SCRAP",
  "SERVER",
  "Services",
  "Software",
  "SOFTWARE & MICROSOFT",
  "SOUND-SPEAKERS-AHUJA-",
  "SPEAKER",
  "SSD",
  "Stationary",
  "STUDIO",
  "TFT",
  "TONER",
  "TONER ACCESSORIES",
  "UPS",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** Fallback when AI / import cannot map to a concrete category. */
export const UNCATEGORIZED_CATEGORY: ProductCategory = "Misc";

/** Older AI / UI labels → current taxonomy. */
export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  "CCTV & Surveillance": "CCTV",
  "Computers & Laptops": "LAPTOP",
  "Monitors & Displays": "TFT",
  "Storage (HDD / SSD)": "HDD",
  "Memory (RAM)": "RAM",
  "Networking & Cables": "NETWORKING",
  "UPS & Power": "UPS",
  "Installation & Service": "Services",
  "General / Uncategorized": UNCATEGORIZED_CATEGORY,
  "Printers & Scanners": "PRINTER",
};

/**
 * Free-form aliases the model / users often emit instead of exact taxonomy values.
 * Keys must be lowercase.
 */
const CATEGORY_ALIASES: Record<string, ProductCategory> = {
  "cctv & surveillance": "CCTV",
  cctv: "CCTV",
  surveillance: "CCTV",
  camera: "CCTV",
  cameras: "CCTV",
  "ip camera": "CCTV",
  "ip cameras": "CCTV",
  nvr: "CCTV",
  dvr: "CCTV",
  "computers & laptops": "LAPTOP",
  laptop: "LAPTOP",
  laptops: "LAPTOP",
  notebook: "LAPTOP",
  notebooks: "LAPTOP",
  macbook: "LAPTOP",
  desktop: "DESKTOP",
  desktops: "DESKTOP",
  "desktop pc": "DESKTOP",
  "desktop pcs": "DESKTOP",
  pc: "DESKTOP",
  pcs: "DESKTOP",
  workstation: "DESKTOP",
  workstations: "DESKTOP",
  "monitors & displays": "TFT",
  monitor: "TFT",
  monitors: "TFT",
  display: "TFT",
  displays: "TFT",
  tft: "TFT",
  led: "LED Display Samsung",
  "led display": "LED Display Samsung",
  "interactive panel": "INTERACTIVE PANELS",
  "interactive panels": "INTERACTIVE PANELS",
  "interactive front panel": "INTERACTIVE PANELS",
  "front panel": "INTERACTIVE PANELS",
  ifp: "INTERACTIVE PANELS",
  smartboard: "INTERACTIVE PANELS",
  "storage (hdd / ssd)": "HDD",
  hdd: "HDD",
  "hard disk": "HDD",
  "hard drive": "HDD",
  ssd: "SSD",
  "memory (ram)": "RAM",
  ram: "RAM",
  memory: "RAM",
  "networking & cables": "NETWORKING",
  networking: "NETWORKING",
  network: "NETWORKING",
  switch: "NETWORKING",
  router: "NETWORKING",
  cable: "CABLE",
  cables: "CABLE",
  "ups & power": "UPS",
  ups: "UPS",
  inverter: "UPS",
  battery: "BATTERY",
  batteries: "BATTERY",
  amaron: "AMARON BATTERIES",
  "printers & scanners": "PRINTER",
  printer: "PRINTER",
  printers: "PRINTER",
  mfp: "PRINTER",
  scanner: "SCANNER",
  scanners: "SCANNER",
  toner: "TONER",
  toners: "TONER",
  cartridge: "CARTRIDGE",
  cartridges: "CARTRIDGE",
  "hp supplies": "HP SUPPLIES",
  projector: "PROJECTOR",
  projectors: "PROJECTOR",
  server: "SERVER",
  servers: "SERVER",
  "lenovo server": "LENOVO SERVER",
  cisco: "Cisco",
  speaker: "SPEAKER",
  speakers: "SPEAKER",
  ahuja: "SOUND-SPEAKERS-AHUJA-",
  keyboard: "KEYBOARD",
  keyboards: "KEYBOARD",
  mouse: "MOUSE",
  pendrive: "PENDRIVE",
  "pen drive": "PENDRIVE",
  "usb drive": "PENDRIVE",
  flashdrive: "PENDRIVE",
  antivirus: "ANTIVIRUS",
  software: "Software",
  microsoft: "SOFTWARE & MICROSOFT",
  office: "SOFTWARE & MICROSOFT",
  windows: "SOFTWARE & MICROSOFT",
  "installation & service": "Services",
  service: "Services",
  services: "Services",
  installation: "Services",
  furniture: "FURNITURE",
  stationary: "Stationary",
  stationery: "Stationary",
  attendance: "ATTENDANCE M/C",
  biometric: "ATTENDANCE M/C",
  bag: "BAG",
  bags: "BAG",
  accessories: "ACCESSORIES",
  accessory: "ACCESSORIES",
  hardware: "Hardware",
  misc: UNCATEGORIZED_CATEGORY,
  miscellaneous: UNCATEGORIZED_CATEGORY,
  general: UNCATEGORIZED_CATEGORY,
  uncategorized: UNCATEGORIZED_CATEGORY,
  "general / uncategorized": UNCATEGORIZED_CATEGORY,
};

/**
 * Description cues used when the parsed category is missing or Misc.
 * More specific patterns first.
 */
/** Labels that are too broad — text cues should win when they disagree. */
const WEAK_CATEGORY_LABELS = new Set<string>([
  "TFT",
  "LED Display Samsung",
  "Hardware",
  "ACCESSORIES",
  "Electronic Goods",
  "Electrical Goods",
  "Misc",
  "old",
  "FIX ASSETS",
  "SCRAP",
  "Debit Note / Credit Note / Discount",
]);

/**
 * Related taxonomy buckets that should share vendors during matching.
 * Example: Harman audio often lives under SPEAKER maps, while AI may label
 * lines as SOUND-SPEAKERS-AHUJA-.
 */
const CATEGORY_FAMILIES: ProductCategory[][] = [
  ["SPEAKER", "SOUND-SPEAKERS-AHUJA-"],
  ["INTERACTIVE PANELS", "TFT", "LED Display Samsung"],
  ["CCTV", "CAMERA- Philips-"],
  ["NETWORKING", "NETWORKING -SYROTECH", "Cisco"],
  ["Software", "SOFTWARE & MICROSOFT"],
  ["PRINTER", "SCANNER", "TONER", "CARTRIDGE", "HP SUPPLIES", "TONER ACCESSORIES"],
];

/**
 * Vendor taxonomy rows that are too vague to gate on — match via keywords instead.
 * Do NOT include concrete display buckets (TFT / LED) even if they are "weak" for RFQ labels.
 */
const LOOSE_VENDOR_CATEGORIES = new Set<string>([
  "Misc",
  "Hardware",
  "ACCESSORIES",
  "Electronic Goods",
  "Electrical Goods",
  "old",
  "FIX ASSETS",
  "SCRAP",
  "Debit Note / Credit Note / Discount",
]);

/** True when a vendor map row should be allowed to match any RFQ line via keywords. */
export function isLooseVendorCategory(
  category: string | null | undefined
): boolean {
  if (isUncategorizedCategory(category)) return true;
  const canonical = canonicalizeProductCategory(category);
  if (!canonical) return true;
  return LOOSE_VENDOR_CATEGORIES.has(canonical);
}

const CATEGORY_FAMILY_INDEX = (() => {
  const map = new Map<string, Set<string>>();
  for (const family of CATEGORY_FAMILIES) {
    const set = new Set<string>(family);
    for (const member of family) map.set(member, set);
  }
  return map;
})();

/** Categories that should be treated as interchangeable for vendor matching. */
export function relatedProductCategories(
  category: string | null | undefined
): string[] {
  const canonical = canonicalizeProductCategory(category);
  if (!canonical) return category ? [category] : [];
  const family = CATEGORY_FAMILY_INDEX.get(canonical);
  if (!family) return [canonical];
  return [...family];
}

export function categoriesCompatible(
  a?: string | null,
  b?: string | null
): boolean {
  const left = canonicalizeProductCategory(a);
  const right = canonicalizeProductCategory(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const family = CATEGORY_FAMILY_INDEX.get(left);
  return Boolean(family?.has(right));
}

const CATEGORY_TEXT_CUES: Array<{ category: ProductCategory; patterns: RegExp[] }> = [
  // Head-noun / accessory lines first so they are not stolen by IFP/PC cues.
  { category: "BAG", patterns: [/\blaptop\s*bags?\b/i, /^\s*bags?\b/i] },
  {
    category: "Services",
    patterns: [
      /^\s*installation\b/i,
      /\binstallation\s*\/?\s*testing\b/i,
      /\bcalibration\s*charges?\b/i,
      /^\s*testing\b/i,
      /\bamc\b/i,
    ],
  },
  {
    category: "SPEAKER",
    patterns: [
      /^\s*speakers?\b/i,
      /\bspeaker\s*phones?\b/i,
      /\bceiling\s*speakers?\b/i,
      /\bmicrophones?\b/i,
      /\bamplifiers?\b/i,
      /\bmixer\b/i,
      /\bharman\b/i,
      /\bjbl\b/i,
      /\bjabra\b/i,
    ],
  },
  { category: "CABLE", patterns: [/^\s*cables?\b/i, /\ball\s+cables?\b/i, /\bhdmi\b/i, /\bcat\s*[56]\b/i] },
  {
    category: "Software",
    patterns: [/^\s*.{0,20}\bsoftware\b/i, /\bcms\s*software\b/i, /\blicen[cs]e\b/i],
  },
  { category: "TONER", patterns: [/\btoners?\b/i] },
  { category: "CARTRIDGE", patterns: [/\bcartridges?\b/i, /\bink\s*cartridges?\b/i] },
  { category: "HP SUPPLIES", patterns: [/\bhp\s*supplies\b/i] },
  {
    category: "RAM",
    patterns: [/\blaptop\s+rams?\b/i, /\bdesktop\s+rams?\b/i, /^\s*rams?\b/i, /\bdimm\b/i, /\bmemory\s*modules?\b/i],
  },
  { category: "SSD", patterns: [/^\s*ssds?\b/i, /\bnvme\b/i] },
  { category: "HDD", patterns: [/^\s*hdds?\b/i, /\bhard\s*disks?\b/i, /\bhard\s*drives?\b/i] },
  {
    category: "INTERACTIVE PANELS",
    patterns: [
      /\bifp(?:d)?\b/i,
      /interactive(?:\s+\w+){0,3}\s+panels?\b/i,
      /interactive(?:\s+\w+){0,2}\s+displays?\b/i,
      /\bfront\s+panels?\b/i,
      /smart\s*boards?\b/i,
      /\btouch\s*displays?\b/i,
    ],
  },
  { category: "LENOVO SERVER", patterns: [/\blenovo\s*servers?\b/i] },
  { category: "LAPTOP", patterns: [/\blaptops?\b/i, /\bnotebooks?\b/i, /\bmacbook\b/i] },
  { category: "DESKTOP", patterns: [/\bdesktops?\b/i, /\bworkstations?\b/i, /\bdesktop\s*pcs?\b/i] },
  {
    category: "CAMERA- Philips-",
    patterns: [
      /\bphillip?s\b.*\bcameras?\b/i,
      /\bcameras?\b.*\bphillip?s\b/i,
      /\bvoice\s*tracking\b/i,
    ],
  },
  {
    category: "CCTV",
    patterns: [
      /\bcctv\b/i,
      /\bip\s*cameras?\b/i,
      /\bconference\s*cameras?\b/i,
      /\bsurveillance\b/i,
      /\bnvr\b/i,
      /\bdvr\b/i,
    ],
  },
  { category: "PRINTER", patterns: [/\bprinters?\b/i, /\bmfp\b/i, /\blaserjet\b/i] },
  { category: "SCANNER", patterns: [/\bscanners?\b/i] },
  { category: "TFT", patterns: [/\bmonitors?\b/i, /\btft\b/i] },
  { category: "LED Display Samsung", patterns: [/\bled\s*displays?\b/i, /\bsamsung\s*led\b/i] },
  { category: "UPS", patterns: [/\bups\b/i, /\binverters?\b/i] },
  { category: "AMARON BATTERIES", patterns: [/\bamaron\b/i] },
  { category: "BATTERY", patterns: [/\bbatter(?:y|ies)\b/i] },
  { category: "NETWORKING -SYROTECH", patterns: [/\bsyrotech\b/i] },
  { category: "Cisco", patterns: [/\bcisco\b/i] },
  {
    category: "NETWORKING",
    patterns: [
      /\bswitches?\b/i,
      /\brouters?\b/i,
      /\bnetworking\b/i,
      /\btx\s*-?\s*rx\b/i,
      /\btransmitter\b/i,
      /\breceivers?\b/i,
    ],
  },
  { category: "SERVER", patterns: [/\bservers?\b/i, /\bracks?\b/i] },
  { category: "PROJECTOR", patterns: [/\bprojectors?\b/i] },
  { category: "SOUND-SPEAKERS-AHUJA-", patterns: [/\bahuja\b/i] },
  { category: "KEYBOARD", patterns: [/\bkeyboards?\b/i] },
  { category: "MOUSE", patterns: [/\bmouses?\b/i, /\bmice\b/i] },
  { category: "PENDRIVE", patterns: [/\bpendrives?\b/i, /\bpen\s*drives?\b/i, /\busb\s*drives?\b/i] },
  { category: "ANTIVIRUS", patterns: [/\bantivirus\b/i, /\bendpoint\s*security\b/i] },
  { category: "SOFTWARE & MICROSOFT", patterns: [/\bmicrosoft\s*365\b/i, /\boffice\s*365\b/i] },
  { category: "ATTENDANCE M/C", patterns: [/\battendance\b/i, /\bbiometric\b/i] },
  { category: "FURNITURE", patterns: [/\bfurniture\b/i, /\bchairs?\b/i, /\bdesks?\b/i] },
  { category: "Stationary", patterns: [/\bstationer(?:y|ies)\b/i] },
  { category: "ACCESSORIES", patterns: [/\baccessories\b/i] },
  { category: "Hardware", patterns: [/\bhardware\b/i] },
];

export function isUncategorizedCategory(
  category: string | null | undefined
): boolean {
  const value = (category || "").trim();
  return (
    !value ||
    value === UNCATEGORIZED_CATEGORY ||
    value === "General / Uncategorized"
  );
}

export const PARSE_CONFIDENCE_THRESHOLD = 0.55;

const canonicalizeCache = new Map<string, ProductCategory | null>();

/** Map a free-form / legacy / AI category label onto the taxonomy (or null if Misc). */
export function canonicalizeProductCategory(
  raw: string | null | undefined
): ProductCategory | null {
  const trimmed = (raw || "").trim();
  if (!trimmed || isUncategorizedCategory(trimmed)) return null;

  const cached = canonicalizeCache.get(trimmed);
  if (cached !== undefined) return cached;

  const lower = trimmed.toLowerCase();
  let resolved: ProductCategory | null = null;

  for (const [legacy, mapped] of Object.entries(LEGACY_CATEGORY_MAP)) {
    if (legacy.toLowerCase() === lower) {
      resolved = isUncategorizedCategory(mapped)
        ? null
        : (mapped as ProductCategory);
      break;
    }
  }

  if (resolved == null) {
    const exact = PRODUCT_CATEGORIES.find(
      (candidate) => candidate.toLowerCase() === lower
    );
    if (exact) {
      resolved = isUncategorizedCategory(exact) ? null : exact;
    }
  }

  if (resolved == null) {
    const alias = CATEGORY_ALIASES[lower];
    if (alias) {
      resolved = isUncategorizedCategory(alias) ? null : alias;
    }
  }

  if (resolved == null) {
    // Soft contains: "Business Laptops" / "Laser Printers".
    // Require a meaningful alias (≥5 chars) so short junk like "pri"/"ice" cannot match.
    let best: { category: ProductCategory; score: number } | null = null;
    for (const [aliasKey, category] of Object.entries(CATEGORY_ALIASES)) {
      if (aliasKey.length < 5) continue;
      if (!lower.includes(aliasKey)) continue;
      const score = aliasKey.length;
      if (!best || score > best.score) {
        best = { category, score };
      }
    }
    if (best && !isUncategorizedCategory(best.category)) {
      resolved = best.category;
    }
  }

  canonicalizeCache.set(trimmed, resolved);
  return resolved;
}

/** Infer a taxonomy category from product description / subject text. */
export function inferProductCategoryFromText(
  text: string | null | undefined
): ProductCategory | null {
  const hay = (text || "").trim();
  if (!hay) return null;

  for (const cue of CATEGORY_TEXT_CUES) {
    if (cue.patterns.some((pattern) => pattern.test(hay))) {
      return cue.category;
    }
  }
  return null;
}

/**
 * Resolve the best concrete category from a parsed label and optional text.
 * Returns Misc only when nothing concrete can be determined.
 * Strong description cues override weak / brand-mismatched AI labels
 * (e.g. TFT on an IFP line, or SOUND-SPEAKERS-AHUJA- on a Harman line).
 */
export function resolveProductCategory(
  raw: string | null | undefined,
  text?: string | null
): ProductCategory {
  const fromLabel = canonicalizeProductCategory(raw);
  const fromText =
    inferProductCategoryFromText(text) || inferProductCategoryFromText(raw);
  // Only inspect product text — never the taxonomy label itself (e.g. "...AHUJA-").
  const productText = String(text || "");

  // Brand-specific taxonomy rows must not stick when the product brand differs.
  if (
    fromLabel === "SOUND-SPEAKERS-AHUJA-" &&
    fromText &&
    fromText !== fromLabel &&
    !/\bahuja\b/i.test(productText)
  ) {
    return fromText;
  }
  if (
    fromLabel === "CAMERA- Philips-" &&
    fromText &&
    fromText !== fromLabel &&
    !/\bphillip?s\b/i.test(productText) &&
    !/\bvoice\s*tracking\b/i.test(productText)
  ) {
    return fromText;
  }

  if (fromText && (!fromLabel || WEAK_CATEGORY_LABELS.has(fromLabel))) {
    return fromText;
  }
  if (
    fromLabel &&
    fromText &&
    fromLabel !== fromText &&
    WEAK_CATEGORY_LABELS.has(fromLabel)
  ) {
    return fromText;
  }
  return fromLabel || fromText || UNCATEGORIZED_CATEGORY;
}

/** Most frequent concrete category among labels (ties → first seen). */
export function dominantProductCategory(
  categories: Array<string | null | undefined>
): ProductCategory | null {
  const counts = new Map<ProductCategory, number>();
  let best: ProductCategory | null = null;
  let bestCount = 0;

  for (const value of categories) {
    const resolved = canonicalizeProductCategory(value);
    if (!resolved) continue;
    const next = (counts.get(resolved) || 0) + 1;
    counts.set(resolved, next);
    if (next > bestCount) {
      best = resolved;
      bestCount = next;
    }
  }
  return best;
}

type CategorisableItem = {
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  quantity?: number | null;
};

/**
 * Re-resolve each item category from taxonomy + description cues, then pick a
 * quantity-weighted dominant RFQ category (fixes legacy labels like
 * "Monitors & Displays" on multi-product RFQs).
 */
export function normalizeParsedItemCategories<T extends CategorisableItem>(
  items: T[],
  fallbackCategory?: string | null
): { items: T[]; productCategory: ProductCategory } {
  const normalized = items.map((item) => {
    const text = [item.description, item.brand].filter(Boolean).join(" ");
    const category = resolveProductCategory(item.category, text);
    return {
      ...item,
      category: category === UNCATEGORIZED_CATEGORY ? null : category,
    };
  });

  const weights = new Map<ProductCategory, { qty: number; lines: number }>();
  for (const item of normalized) {
    const category = canonicalizeProductCategory(item.category);
    if (!category) continue;
    const qty =
      typeof item.quantity === "number" &&
      Number.isFinite(item.quantity) &&
      item.quantity > 0
        ? item.quantity
        : 1;
    const prev = weights.get(category) || { qty: 0, lines: 0 };
    weights.set(category, { qty: prev.qty + qty, lines: prev.lines + 1 });
  }

  let best: ProductCategory | null = null;
  let bestQty = 0;
  let bestLines = 0;
  for (const [category, weight] of weights) {
    if (
      weight.qty > bestQty ||
      (weight.qty === bestQty && weight.lines > bestLines)
    ) {
      best = category;
      bestQty = weight.qty;
      bestLines = weight.lines;
    }
  }

  const fallback = canonicalizeProductCategory(fallbackCategory);
  return {
    items: normalized,
    productCategory: best || fallback || UNCATEGORIZED_CATEGORY,
  };
}

/** Fix legacy/wrong categories already stored on an RFQ without re-calling AI. */
export function normalizeStoredRfqCategories(input: {
  parsedCategory?: string | null;
  parsedSpecs?: unknown;
}): {
  parsedCategory: string | null;
  parsedSpecs: Record<string, unknown> | null;
  changed: boolean;
} {
  const specs =
    input.parsedSpecs && typeof input.parsedSpecs === "object"
      ? ({ ...(input.parsedSpecs as Record<string, unknown>) } as Record<
          string,
          unknown
        >)
      : null;

  const rawItems = Array.isArray(specs?.items) ? [...(specs!.items as unknown[])] : [];
  if (rawItems.length === 0) {
    // Unparsed / empty RFQs must stay null — never invent "Misc".
    if (!input.parsedCategory) {
      return {
        parsedCategory: null,
        parsedSpecs: specs,
        changed: false,
      };
    }
    const parsedCategory = resolveProductCategory(input.parsedCategory);
    return {
      parsedCategory:
        parsedCategory === UNCATEGORIZED_CATEGORY &&
        isUncategorizedCategory(input.parsedCategory)
          ? input.parsedCategory
          : parsedCategory,
      parsedSpecs: specs,
      changed: parsedCategory !== input.parsedCategory,
    };
  }

  // Preserve non-object rows in place; only rewrite object line items.
  const objectIndexes: number[] = [];
  const objectItems: Array<CategorisableItem & Record<string, unknown>> = [];
  for (let i = 0; i < rawItems.length; i += 1) {
    const row = rawItems[i];
    if (row && typeof row === "object") {
      objectIndexes.push(i);
      objectItems.push(row as CategorisableItem & Record<string, unknown>);
    }
  }

  const before = JSON.stringify(
    objectItems.map((item) => [item.category || null, item.description || ""])
  );
  const normalized = normalizeParsedItemCategories(
    objectItems,
    input.parsedCategory
  );
  const after = JSON.stringify(
    normalized.items.map((item) => [
      item.category || null,
      item.description || "",
    ])
  );

  const nextItems = [...rawItems];
  for (let i = 0; i < objectIndexes.length; i += 1) {
    nextItems[objectIndexes[i]] = normalized.items[i];
  }

  const nextSpecs = specs
    ? {
        ...specs,
        items: nextItems,
      }
    : { items: nextItems };

  return {
    parsedCategory: normalized.productCategory,
    parsedSpecs: nextSpecs,
    changed:
      before !== after ||
      normalized.productCategory !== (input.parsedCategory || ""),
  };
}
