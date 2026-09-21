import { prisma } from "@/lib/prisma";
import { extractKeywords, tokenize, tokensLooselyMatch } from "@/lib/product-match";
import { normalizeProductKey } from "@/lib/product-key";
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

export type VendorMatch = {
  vendor: {
    id: string;
    name: string;
    phone: string;
    email: string;
    whatsappId: string;
    preferredChannel: "EMAIL" | "WHATSAPP";
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
  if (!a || !b) return false;
  if (a === "General / Uncategorized" || b === "General / Uncategorized") {
    return false;
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Exact token equality or safe plural/stem — no weak substring matches. */
function exactKeywordOverlap(
  rfqKeywords: string[],
  vendorKeywords: string[]
): string[] {
  const matched: string[] = [];
  for (const vk of vendorKeywords) {
    if (vk.length < 2) continue;
    const hit = rfqKeywords.some(
      (rk) => rk === vk || tokensLooselyMatch(rk, vk)
    );
    if (hit) matched.push(vk);
  }
  return [...new Set(matched)];
}

function itemKeywords(item: RfqRequirementItem, rfqCategory?: string | null): string[] {
  return extractKeywords({
    parsedCategory: item.category || rfqCategory,
    parsedSpecs: {
      description: item.description,
      brand: item.brand,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
    },
    subject: requirementSearchText(item),
  });
}

function itemProductKey(
  item: RfqRequirementItem,
  rfqCategory?: string | null
): string {
  return normalizeProductKey({
    parsedCategory: item.category || rfqCategory,
    parsedSpecs: {
      description: item.description,
      brand: item.brand,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
    },
    subject: requirementSearchText(item),
  });
}

type CategoryScore = {
  category: string;
  subcategory: string;
  matchedKeywords: string[];
  score: number;
};

function scoreVendorCategoryForItem(input: {
  vendorCategory: {
    category: string;
    subcategory: string;
    keywords: unknown;
  };
  itemCategory: string | null | undefined;
  rfqCategory: string | null | undefined;
  rfqKeywords: string[];
}): CategoryScore | null {
  const { vendorCategory, itemCategory, rfqCategory, rfqKeywords } = input;
  const targetCategory = itemCategory || rfqCategory;
  const exactCategory = categoriesEqual(vendorCategory.category, targetCategory);

  // Require exact category when the RFQ/item has a real category.
  if (
    targetCategory &&
    targetCategory !== "General / Uncategorized" &&
    !exactCategory
  ) {
    return null;
  }

  const vendorKeywords = [
    ...normalizeKeywords(vendorCategory.keywords),
    ...tokenize(`${vendorCategory.category} ${vendorCategory.subcategory}`),
  ];
  const matchedKeywords = exactKeywordOverlap(rfqKeywords, vendorKeywords);

  const subcategoryTokens = tokenize(vendorCategory.subcategory || "");
  const subcategoryHit =
    subcategoryTokens.length > 0 &&
    subcategoryTokens.every((token) =>
      rfqKeywords.some((kw) => kw === token || tokensLooselyMatch(kw, token))
    );

  // Exact category alone is not enough — need keyword or subcategory evidence.
  if (!exactCategory && matchedKeywords.length === 0 && !subcategoryHit) {
    return null;
  }
  if (exactCategory && matchedKeywords.length === 0 && !subcategoryHit) {
    // Allow exact category-only when RFQ keywords are empty (sparse parse).
    if (rfqKeywords.length > 0) return null;
  }

  const score =
    (exactCategory ? 20 : 0) +
    matchedKeywords.length * 5 +
    (subcategoryHit ? 8 : 0);

  if (score <= 0) return null;

  return {
    category: vendorCategory.category,
    subcategory: vendorCategory.subcategory,
    matchedKeywords,
    score,
  };
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
  const fallbackProductKey = normalizeProductKey(input);
  const globalKeywords = extractKeywords(input);

  const lines: Array<{
    item: RfqRequirementItem;
    keywords: string[];
    productKey: string;
    category: string | null;
  }> =
    items.length > 0
      ? items.map((item) => ({
          item,
          keywords: itemKeywords(item, input.parsedCategory),
          productKey: itemProductKey(item, input.parsedCategory),
          category: item.category || input.parsedCategory || null,
        }))
      : [
          {
            item: {
              lineNumber: 1,
              description: input.subject || "RFQ",
              quantity: 1,
              unit: "pcs",
              brand: null,
              category: input.parsedCategory || null,
            },
            keywords: globalKeywords,
            productKey: fallbackProductKey,
            category: input.parsedCategory || null,
          },
        ];

  const categoryFilters = [
    ...new Set(
      lines
        .map((line) => line.category)
        .filter(
          (category): category is string =>
            Boolean(category) && category !== "General / Uncategorized"
        )
    ),
  ];

  const productKeys = [...new Set(lines.map((line) => line.productKey))];

  const vendors = await prisma.vendor.findMany({
    where: {
      active: true,
      ...(categoryFilters.length > 0
        ? { categories: { some: { category: { in: categoryFilters } } } }
        : {}),
    },
    include: {
      categories: true,
      productHistory: {
        where: { productKey: { in: productKeys } },
        orderBy: { lastQuotedAt: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  type Acc = {
    vendor: VendorMatch["vendor"];
    bestCategory: CategoryScore;
    matchedLines: VendorLineQuote[];
    totalScore: number;
    lastQuotedAt: Date | null;
  };

  const byVendor = new Map<string, Acc>();

  for (const vendor of vendors) {
    for (const line of lines) {
      let bestForLine: CategoryScore | undefined;

      for (const category of vendor.categories) {
        const scored = scoreVendorCategoryForItem({
          vendorCategory: category,
          itemCategory: line.category,
          rfqCategory: input.parsedCategory,
          rfqKeywords: line.keywords.length > 0 ? line.keywords : globalKeywords,
        });
        if (!scored) continue;
        if (!bestForLine || scored.score > bestForLine.score) {
          bestForLine = scored;
        }
      }

      if (!bestForLine) continue;

      const history = vendor.productHistory.find(
        (row) => row.productKey === line.productKey
      );
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
    const estimatedTotal =
      linesWithPrice.length > 0 &&
      linesWithPrice.length === entry.matchedLines.length
        ? linesWithPrice.reduce((sum, l) => sum + (l.lineTotal || 0), 0)
        : linesWithPrice.length > 0
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
