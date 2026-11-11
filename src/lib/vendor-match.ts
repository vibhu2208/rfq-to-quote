import {
  canonicalizeProductCategory,
  categoriesCompatible,
  dominantProductCategory,
  inferProductCategoryFromText,
  isLooseVendorCategory,
  isUncategorizedCategory,
  relatedProductCategories,
  resolveProductCategory,
} from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { extractKeywords, tokenize, tokensLooselyMatch } from "@/lib/product-match";
import {
  isSpecificProductKey,
  normalizeProductKey,
} from "@/lib/product-key";
import { decimalToNumber } from "@/lib/quotes";
import {
  extractRfqItems,
  requirementSearchText,
  type RfqRequirementItem,
} from "@/lib/rfq-items";
import { normalizeKeywords } from "@/lib/vendor-schema";

export type VendorMatchInput = {
  parsedCategory?: string | null;
  parsedSpecs?: unknown;
  subject?: string;
  rawText?: string;
};

export type VendorLineQuote = {
  lineNumber: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  lineTotal: number | null;
  productKey: string;
};

export type VendorContactMatch = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isPrimary: boolean;
  vendorCategoryId?: string | null;
};

export type VendorMatch = {
  vendor: {
    id: string;
    name: string;
    phone: string;
    email: string;
    whatsappId: string;
    preferredChannel: "EMAIL" | "WHATSAPP";
    contacts: VendorContactMatch[];
  };
  category: string;
  subcategory: string;
  matchedKeywords: string[];
  score: number;
  productKey: string;
  lastPrice: number | null;
  lastQuotedAt: string | null;
  /** RFQ lines this vendor exactly covers (category + keyword). */
  matchedLines: VendorLineQuote[];
  /** Sum of last known unit prices × qty for covered lines (when available). */
  estimatedTotal: number | null;
};

function categoriesEqual(a?: string | null, b?: string | null): boolean {
  return categoriesCompatible(a, b);
}

/**
 * Company-name tokens that appear in Misc vendor keywords and also in RFQ
 * specs (e.g. "phantom power", "6 zone", "50MP camera"). Ignore these when
 * matching uncategorized vendors so UPS firms don't win speaker lines.
 */
const WEAK_VENDOR_KEYWORDS = new Set([
  "power",
  "input",
  "output",
  "zone",
  "camera",
  "mic",
  "mike",
  "line",
  "card",
  "usb",
  "sd",
  "fm",
  "dsp",
  "ram",
  "ssd",
  "hdd",
  "wifi",
  "lan",
  "oem",
  "ops",
  "gen",
  "android",
  "windows",
  "core",
  "octa",
  "warranty",
  "installation",
  "india",
  "private",
  "limited",
  "pvt",
  "ltd",
  "llp",
  "solutions",
  "technologies",
  "technology",
  "tech",
  "system",
  "systems",
  "services",
  "service",
  "company",
  "enterprises",
  "enterprise",
  "international",
  "corp",
  "corporation",
  "industries",
  "industry",
  "group",
  "trading",
  "traders",
  "electronics",
  "electrical",
  "equipment",
  "equipments",
  "general",
  "global",
  "world",
  "digital",
  "media",
  "info",
  "infotech",
  "communications",
  "communication",
]);

/** Single-token Misc hits that are enough on their own (brands / head nouns). */
const HIGH_VALUE_VENDOR_KEYWORDS = new Set([
  "interactive",
  "viewsonic",
  "harman",
  "ahuja",
  "jbl",
  "jabra",
  "phillips",
  "philips",
  "microphone",
  "speakerphone",
  "speakers",
  "speaker",
  "ifp",
  "ifpd",
  "smartboard",
  "cisco",
  "syrotech",
  "samsung",
  "lg",
  "dell",
  "hp",
  "lenovo",
  "epson",
  "canon",
  "hikvision",
  "dahua",
  "cpplus",
]);

function isStrongVendorKeyword(keyword: string): boolean {
  const value = keyword.trim().toLowerCase();
  if (value.length < 3) return false;
  if (WEAK_VENDOR_KEYWORDS.has(value)) return false;
  // Pure numbers / account codes from imports are not product signals.
  if (/^\d+$/.test(value)) return false;
  return true;
}

function isHighValueVendorKeyword(keyword: string): boolean {
  const value = keyword.trim().toLowerCase();
  if (HIGH_VALUE_VENDOR_KEYWORDS.has(value)) return true;
  // Long brand-like tokens (e.g. "viewsonic" already listed; catch others).
  return value.length >= 8 && isStrongVendorKeyword(value);
}

function looseVendorKeywordEvidence(strongExplicit: string[]): boolean {
  if (strongExplicit.length >= 2) return true;
  return strongExplicit.some(isHighValueVendorKeyword);
}

/** Concrete category for an RFQ line: parsed label, else description cues. */
export function resolveLineCategory(
  item: Pick<RfqRequirementItem, "description" | "brand" | "category">,
  rfqCategory?: string | null
): string | null {
  const text = [item.description, item.brand].filter(Boolean).join(" ");
  const fromItem = resolveProductCategory(item.category, text);
  if (fromItem && fromItem !== "Misc") return fromItem;

  const fromRfq = canonicalizeProductCategory(rfqCategory);
  return fromRfq || null;
}

/**
 * Phrase-aware keyword overlap.
 * Vendor maps often store "ip camera" / "interactive flat panel" as one keyword
 * while RFQ text is tokenized — require all phrase tokens to be present.
 */
function exactKeywordOverlap(
  rfqKeywords: string[],
  vendorKeywords: string[]
): string[] {
  const rfqSet = new Set(rfqKeywords);
  const matched: string[] = [];
  for (const vk of vendorKeywords) {
    if (vk.length < 2) continue;
    const phraseTokens = tokenize(vk);
    if (phraseTokens.length > 1) {
      const allPresent = phraseTokens.every(
        (token) =>
          rfqSet.has(token) ||
          rfqKeywords.some((rk) => tokensLooselyMatch(rk, token))
      );
      if (allPresent) matched.push(vk);
      continue;
    }
    const hit = rfqKeywords.some(
      (rk) => rk === vk || tokensLooselyMatch(rk, vk)
    );
    if (hit) matched.push(vk);
  }
  return [...new Set(matched)];
}

function itemKeywords(item: RfqRequirementItem, rfqCategory?: string | null): string[] {
  return extractKeywords({
    parsedSpecs: {
      description: item.description,
      brand: item.brand,
    },
    subject: requirementSearchText(item),
  });
}

/** Shared key builder for match lookup and vendor price-history writes. */
export function productKeyForLine(
  item: Pick<RfqRequirementItem, "description" | "brand" | "category">,
  rfqCategory?: string | null
): string {
  const category = resolveLineCategory(item, rfqCategory);
  return normalizeProductKey({
    parsedCategory: category || item.category || rfqCategory,
    parsedSpecs: {
      description: item.description,
      brand: item.brand,
      category,
    },
    subject: item.description,
  });
}

function itemProductKey(
  item: RfqRequirementItem,
  rfqCategory?: string | null
): string {
  return productKeyForLine(item, rfqCategory);
}

type CategoryScore = {
  vendorCategoryId: string;
  category: string;
  subcategory: string;
  matchedKeywords: string[];
  score: number;
};

/** Exported for unit tests — scores one vendor taxonomy row against one RFQ line. */
export function scoreVendorCategoryForItem(input: {
  vendorCategory: {
    id: string;
    category: string;
    subcategory: string;
    keywords: unknown;
  };
  itemCategory: string | null | undefined;
  rfqCategory: string | null | undefined;
  rfqKeywords: string[];
  precomputed?: {
    explicitKeywords: string[];
    labelTokens: string[];
    subcategoryTokens: string[];
  };
}): CategoryScore | null {
  const { vendorCategory, itemCategory, rfqCategory, rfqKeywords } = input;
  const targetCategory =
    canonicalizeProductCategory(itemCategory) ||
    canonicalizeProductCategory(rfqCategory);
  const exactCategory = categoriesEqual(vendorCategory.category, targetCategory);
  const looseVendor = isLooseVendorCategory(vendorCategory.category);

  // Concrete vendor categories must match the line; Misc/Hardware may fall through
  // to keyword evidence (most of the imported catalog is Misc).
  if (targetCategory && !exactCategory && !looseVendor) {
    return null;
  }

  const explicitKeywords =
    input.precomputed?.explicitKeywords ??
    normalizeKeywords(vendorCategory.keywords);
  const labelTokens =
    input.precomputed?.labelTokens ??
    tokenize(`${vendorCategory.category} ${vendorCategory.subcategory}`);
  const matchedExplicit = exactKeywordOverlap(rfqKeywords, explicitKeywords);
  const matchedLabel = exactKeywordOverlap(rfqKeywords, labelTokens);
  const matchedKeywords = [...new Set([...matchedExplicit, ...matchedLabel])];

  const subcategoryTokens =
    input.precomputed?.subcategoryTokens ??
    tokenize(vendorCategory.subcategory || "");
  const subcategoryHit =
    subcategoryTokens.length > 0 &&
    subcategoryTokens.every((token) =>
      rfqKeywords.some((kw) => kw === token || tokensLooselyMatch(kw, token))
    );

  const strongExplicit = matchedExplicit.filter(isStrongVendorKeyword);

  if (!exactCategory) {
    // Loose / uncategorized vendor rows: require distinctive keyword evidence
    // (brand / product tokens), not component specs like ram/ssd/wifi.
    if (
      !looseVendorKeywordEvidence(strongExplicit) &&
      !subcategoryHit
    ) {
      return null;
    }
  }
  // Exact category is enough to include the vendor; keywords only improve rank
  // (covers brand/model lines like "Dell Latitude 5540" under LAPTOP).

  const score =
    (exactCategory ? 20 : 0) +
    (exactCategory ? matchedExplicit.length : strongExplicit.length) * 6 +
    // Ignore Misc/Hardware label-token hits — they are not product signals.
    (exactCategory || !looseVendor ? matchedLabel.length * 3 : 0) +
    (subcategoryHit ? 10 : 0);

  if (score <= 0) return null;

  return {
    vendorCategoryId: vendorCategory.id,
    // Surface the RFQ line category when the vendor map is only Misc.
    category:
      !exactCategory && looseVendor && targetCategory
        ? targetCategory
        : vendorCategory.category,
    subcategory: vendorCategory.subcategory,
    matchedKeywords: exactCategory ? matchedKeywords : strongExplicit,
    score,
  };
}

/** Best vendor taxonomy row for the lines being emailed (subject / body Category). */
export function pickOutreachCategory(input: {
  items: Array<Pick<RfqRequirementItem, "description" | "brand" | "category">>;
  vendorCategories: Array<{
    category: string;
    subcategory: string;
    keywords?: unknown;
  }>;
  rfqCategory?: string | null;
}): string {
  const lineCategories = input.items
    .map((item) => resolveLineCategory(item, input.rfqCategory))
    .filter((value): value is string => Boolean(value));

  const dominant = dominantProductCategory(lineCategories);
  if (dominant) {
    const vendorHasDominant = input.vendorCategories.some((row) =>
      categoriesEqual(row.category, dominant)
    );
    if (vendorHasDominant || input.vendorCategories.length === 0) {
      return dominant;
    }
  }

  let best: CategoryScore | null = null;
  for (const item of input.items) {
    const keywords = extractKeywords({
      parsedCategory: resolveLineCategory(item, input.rfqCategory),
      parsedSpecs: {
        description: item.description,
        brand: item.brand,
        category: item.category,
      },
      subject: requirementSearchText({
        lineNumber: 1,
        description: item.description,
        quantity: 1,
        unit: "pcs",
        brand: item.brand,
        category: item.category,
      }),
    });
    for (const vendorCategory of input.vendorCategories) {
      const scored = scoreVendorCategoryForItem({
        vendorCategory: {
          id: "outreach",
          category: vendorCategory.category,
          subcategory: vendorCategory.subcategory,
          keywords: vendorCategory.keywords,
        },
        itemCategory: resolveLineCategory(item, input.rfqCategory),
        rfqCategory: input.rfqCategory,
        rfqKeywords: keywords,
      });
      if (scored && (!best || scored.score > best.score)) {
        best = scored;
      }
    }
  }
  if (best) return best.category;

  const rfqResolved = canonicalizeProductCategory(input.rfqCategory);
  if (rfqResolved) return rfqResolved;

  const firstVendor = input.vendorCategories.find(
    (row) => !isUncategorizedCategory(row.category)
  );
  return firstVendor?.category || resolveProductCategory(input.rfqCategory);
}

function contactsForMatchedCategory(
  vendor: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    whatsappId: string | null;
    contacts: Array<{
      id: string;
      name: string;
      email: string;
      phone: string;
      role: string;
      isPrimary: boolean;
      vendorCategoryId: string | null;
    }>;
  },
  vendorCategoryId: string
): VendorContactMatch[] {
  const scoped = vendor.contacts.filter(
    (contact) => contact.vendorCategoryId === vendorCategoryId
  );
  const general = vendor.contacts.filter((contact) => !contact.vendorCategoryId);
  const preferred = scoped.length > 0 ? scoped : general.length > 0 ? general : vendor.contacts;

  const mapped =
    preferred.length > 0
      ? preferred.map((contact) => ({
          id: contact.id,
          name: contact.name || "",
          email: contact.email || "",
          phone: contact.phone || "",
          role: contact.role || "",
          isPrimary: contact.isPrimary,
          vendorCategoryId: contact.vendorCategoryId,
        }))
      : [];

  const vendorWa = (vendor.whatsappId || vendor.phone || "").trim();
  const hasPhone = mapped.some((contact) => Boolean(contact.phone));
  if (vendorWa && !hasPhone) {
    mapped.push({
      id: `vendor-${vendor.id}-wa`,
      name: vendor.name,
      email: vendor.email || "",
      phone: vendorWa,
      role: "WhatsApp",
      isPrimary: mapped.length === 0,
      vendorCategoryId: null,
    });
  } else if (mapped.length === 0 && (vendor.email || vendorWa)) {
    mapped.push({
      id: `vendor-${vendor.id}`,
      name: vendor.name,
      email: vendor.email || "",
      phone: vendorWa,
      role: "",
      isPrimary: true,
      vendorCategoryId: null,
    });
  }
  return mapped;
}

/**
 * Finds vendors with exact category filtering plus strict keyword overlap.
 * Multi-product RFQs are matched per requirement line, then vendors are
 * ranked by how many lines they cover and how strong each line match is.
 */
export async function matchVendorsToRfq(
  input: VendorMatchInput,
  limit = 20
): Promise<{ productKey: string; keywords: string[]; matches: VendorMatch[] }> {
  const items = extractRfqItems(input.parsedSpecs, input.rawText);
  const resolvedRfqCategory = canonicalizeProductCategory(input.parsedCategory);
  const fallbackProductKey = normalizeProductKey({
    ...input,
    parsedCategory: resolvedRfqCategory || input.parsedCategory,
  });
  const globalKeywords = extractKeywords(input);

  const lines: Array<{
    item: RfqRequirementItem;
    keywords: string[];
    productKey: string;
    category: string | null;
  }> =
    items.length > 0
      ? items.map((item) => {
          const category = resolveLineCategory(item, resolvedRfqCategory);
          return {
            item,
            keywords: itemKeywords(
              { ...item, category: category || item.category },
              category || resolvedRfqCategory
            ),
            productKey: itemProductKey(
              { ...item, category: category || item.category },
              category || resolvedRfqCategory
            ),
            category,
          };
        })
      : [
          {
            item: {
              lineNumber: 1,
              description: input.subject || "RFQ",
              quantity: 1,
              unit: "pcs",
              brand: null,
              category: resolvedRfqCategory,
            },
            keywords: globalKeywords,
            productKey: fallbackProductKey,
            category:
              resolvedRfqCategory ||
              inferProductCategoryFromText(
                [input.subject, input.rawText?.slice(0, 400)]
                  .filter(Boolean)
                  .join(" ")
              ),
          },
        ];

  const categoryFilters = [
    ...new Set(
      lines
        .flatMap((line) => relatedProductCategories(line.category))
        .filter(
          (category): category is string =>
            Boolean(category) && !isUncategorizedCategory(category)
        )
    ),
  ];
  // Include legacy / lowercase aliases so prefilter does not drop remappable rows.
  const categoryFilterValues = [
    ...new Set(
      categoryFilters.flatMap((category) => {
        const values = [
          category,
          category.toLowerCase(),
          category.toUpperCase(),
          ...relatedProductCategories(category),
        ];
        for (const [legacy, mapped] of Object.entries({
          "CCTV & Surveillance": "CCTV",
          "Computers & Laptops": "LAPTOP",
          "Monitors & Displays": "TFT",
          "Printers & Scanners": "PRINTER",
          "Networking & Cables": "NETWORKING",
          "UPS & Power": "UPS",
          "Memory (RAM)": "RAM",
          "Storage (HDD / SSD)": "HDD",
        })) {
          if (mapped === category || relatedProductCategories(mapped).includes(category)) {
            values.push(legacy);
          }
        }
        return values;
      })
    ),
  ];

  const productKeys = [...new Set(lines.map((line) => line.productKey))];
  const keywordHints = [
    ...new Set(
      lines
        .flatMap((line) => line.keywords)
        .map((keyword) => keyword.trim().toLowerCase())
        .filter(isStrongVendorKeyword)
    ),
  ].slice(0, 48);

  const looseCategoryValues = [
    "Misc",
    "misc",
    "Hardware",
    "ACCESSORIES",
    "Electronic Goods",
    "Electrical Goods",
    "General / Uncategorized",
  ];

  // Avoid OR'ing dozens of JSON array_contains predicates (very slow on
  // Postgres). Load category + loose-bucket vendors, then keyword-filter in JS.
  const vendorInclude = {
    categories: true,
    contacts: { orderBy: [{ isPrimary: "desc" as const }, { name: "asc" as const }] },
    productHistory: {
      where: { productKey: { in: productKeys } },
      orderBy: { lastQuotedAt: "desc" as const },
    },
  };

  const vendors =
    categoryFilterValues.length === 0
      ? await prisma.vendor.findMany({
          where: { active: true },
          include: vendorInclude,
          orderBy: { name: "asc" },
        })
      : await (async () => {
          const [categoryVendors, looseVendors] = await Promise.all([
            prisma.vendor.findMany({
              where: {
                active: true,
                categories: {
                  some: { category: { in: categoryFilterValues } },
                },
              },
              include: vendorInclude,
              orderBy: { name: "asc" },
            }),
            keywordHints.length > 0
              ? prisma.vendor.findMany({
                  where: {
                    active: true,
                    categories: {
                      some: { category: { in: looseCategoryValues } },
                    },
                  },
                  include: vendorInclude,
                  orderBy: { name: "asc" },
                })
              : Promise.resolve([]),
          ]);

          const byId = new Map(categoryVendors.map((vendor) => [vendor.id, vendor]));
          const hintSet = new Set(keywordHints);
          for (const vendor of looseVendors) {
            if (byId.has(vendor.id)) continue;
            const hitsKeyword = vendor.categories.some((category) => {
              if (
                !looseCategoryValues.some(
                  (value) => value.toLowerCase() === category.category.toLowerCase()
                )
              ) {
                return false;
              }
              const words = normalizeKeywords(category.keywords);
              return words.some((word) => hintSet.has(word));
            });
            if (hitsKeyword) byId.set(vendor.id, vendor);
          }
          return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
        })();

  type Acc = {
    vendor: VendorMatch["vendor"];
    bestCategory: CategoryScore;
    matchedLines: VendorLineQuote[];
    totalScore: number;
    lastQuotedAt: Date | null;
  };

  const byVendor = new Map<string, Acc>();
  const vendorCategoryCache = new Map<
    string,
    {
      id: string;
      category: string;
      subcategory: string;
      keywords: unknown;
      explicitKeywords: string[];
      labelTokens: string[];
      subcategoryTokens: string[];
    }
  >();

  for (const vendor of vendors) {
    for (const category of vendor.categories) {
      if (vendorCategoryCache.has(category.id)) continue;
      vendorCategoryCache.set(category.id, {
        id: category.id,
        category: category.category,
        subcategory: category.subcategory,
        keywords: category.keywords,
        explicitKeywords: normalizeKeywords(category.keywords),
        labelTokens: tokenize(`${category.category} ${category.subcategory}`),
        subcategoryTokens: tokenize(category.subcategory || ""),
      });
    }

    for (const line of lines) {
      let bestForLine: CategoryScore | undefined;
      const rfqKeywords =
        line.keywords.length > 0 ? line.keywords : globalKeywords;

      for (const category of vendor.categories) {
        const cached = vendorCategoryCache.get(category.id)!;
        const scored = scoreVendorCategoryForItem({
          vendorCategory: cached,
          itemCategory: line.category,
          rfqCategory: input.parsedCategory,
          rfqKeywords,
          precomputed: cached,
        });
        if (!scored) continue;
        if (!bestForLine || scored.score > bestForLine.score) {
          bestForLine = scored;
        }
      }

      if (!bestForLine) continue;

      // Only reuse last-quoted prices when the product key is specific
      // (e.g. printer-samsung-m2876nd). Broad keys like "printers" / "general"
      // must not invent a cost for a first-time SKU.
      const history =
        isSpecificProductKey(line.productKey)
          ? vendor.productHistory.find(
              (row) => row.productKey === line.productKey
            )
          : undefined;
      const unitPrice = history ? decimalToNumber(history.lastPrice) : null;
      const quantity = line.item.quantity || 1;
      const lineQuote: VendorLineQuote = {
        lineNumber: line.item.lineNumber,
        description: line.item.description,
        quantity,
        unit: line.item.unit,
        unitPrice,
        lineTotal: unitPrice != null ? unitPrice * quantity : null,
        productKey: line.productKey,
      };

      const existing = byVendor.get(vendor.id);
      if (!existing) {
        byVendor.set(vendor.id, {
          vendor: {
            id: vendor.id,
            name: vendor.name,
            phone: vendor.phone || "",
            email: vendor.email || "",
            whatsappId: vendor.whatsappId || "",
            preferredChannel: vendor.preferredChannel,
            contacts: contactsForMatchedCategory(vendor, bestForLine.vendorCategoryId),
          },
          bestCategory: bestForLine,
          matchedLines: [lineQuote],
          totalScore: bestForLine.score + 12, // coverage bonus per line
          lastQuotedAt: history?.lastQuotedAt ?? null,
        });
      } else {
        const already = existing.matchedLines.some(
          (m) => m.lineNumber === lineQuote.lineNumber
        );
        if (!already) {
          existing.matchedLines.push(lineQuote);
          existing.totalScore += bestForLine.score + 12;
        } else {
          existing.totalScore += Math.max(0, bestForLine.score - 5);
        }
        if (bestForLine.score > existing.bestCategory.score) {
          existing.bestCategory = bestForLine;
          existing.vendor.contacts = contactsForMatchedCategory(
            vendor,
            bestForLine.vendorCategoryId
          );
        }
        if (
          history?.lastQuotedAt &&
          (!existing.lastQuotedAt || history.lastQuotedAt > existing.lastQuotedAt)
        ) {
          existing.lastQuotedAt = history.lastQuotedAt;
        }
      }
    }
  }

  const matches: VendorMatch[] = [...byVendor.values()].map((entry) => {
    const linesWithPrice = entry.matchedLines.filter((l) => l.unitPrice != null);
    const allPriced =
      entry.matchedLines.length > 0 &&
      linesWithPrice.length === entry.matchedLines.length;
    const estimatedTotal = allPriced
      ? linesWithPrice.reduce((sum, l) => sum + (l.lineTotal || 0), 0)
      : null;

    const primaryKey =
      entry.matchedLines.length === 1
        ? entry.matchedLines[0].productKey
        : fallbackProductKey;

    const singleLast =
      entry.matchedLines.length === 1 ? entry.matchedLines[0].unitPrice : null;

    return {
      vendor: entry.vendor,
      category: entry.bestCategory.category,
      subcategory: entry.bestCategory.subcategory,
      matchedKeywords: entry.bestCategory.matchedKeywords,
      score: entry.totalScore,
      productKey: primaryKey,
      // Never surface a partial sum as "last quoted".
      lastPrice: estimatedTotal ?? singleLast,
      lastQuotedAt: entry.lastQuotedAt?.toISOString() || null,
      matchedLines: entry.matchedLines.sort(
        (a, b) => a.lineNumber - b.lineNumber
      ),
      estimatedTotal,
    };
  });

  matches.sort((a, b) => {
    const coverage =
      b.matchedLines.length - a.matchedLines.length;
    if (coverage) return coverage;
    const historyDifference =
      Number(Boolean(b.lastQuotedAt)) - Number(Boolean(a.lastQuotedAt));
    return (
      historyDifference ||
      b.score - a.score ||
      a.vendor.name.localeCompare(b.vendor.name)
    );
  });

  return {
    productKey: fallbackProductKey,
    keywords: globalKeywords,
    matches: matches.slice(0, limit),
  };
}
