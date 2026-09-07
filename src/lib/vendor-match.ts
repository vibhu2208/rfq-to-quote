import { prisma } from "@/lib/prisma";
import { extractKeywords, tokenize } from "@/lib/product-match";
import { normalizeProductKey } from "@/lib/product-key";
import { decimalToNumber } from "@/lib/quotes";
import { normalizeKeywords } from "@/lib/vendor-schema";

export type VendorMatchInput = {
  parsedCategory?: string | null;
  parsedSpecs?: unknown;
  subject?: string;
  rawText?: string;
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
};

/**
 * Finds vendors using exact category filtering plus deterministic keyword
 * overlap. Historical pricing is joined by the normalized product key.
 */
export async function matchVendorsToRfq(
  input: VendorMatchInput,
  limit = 20
): Promise<{ productKey: string; keywords: string[]; matches: VendorMatch[] }> {
  const productKey = normalizeProductKey(input);
  const rfqKeywords = extractKeywords(input);
  const rfqKeywordSet = new Set(rfqKeywords);

  const vendors = await prisma.vendor.findMany({
    where: {
      active: true,
      ...(input.parsedCategory &&
      input.parsedCategory !== "General / Uncategorized"
        ? { categories: { some: { category: input.parsedCategory } } }
        : {}),
    },
    include: {
      categories: true,
      productHistory: {
        where: { productKey },
        orderBy: { lastQuotedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  const matches: VendorMatch[] = [];

  for (const vendor of vendors) {
    let best:
      | {
          category: string;
          subcategory: string;
          matchedKeywords: string[];
          score: number;
        }
      | undefined;

    for (const category of vendor.categories) {
      const exactCategory =
        Boolean(input.parsedCategory) &&
        category.category.toLowerCase() === input.parsedCategory?.toLowerCase();
      if (
        input.parsedCategory &&
        input.parsedCategory !== "General / Uncategorized" &&
        !exactCategory
      ) {
        continue;
      }

      const vendorKeywords = [
        ...normalizeKeywords(category.keywords),
        ...tokenize(`${category.category} ${category.subcategory}`),
      ];
      const matchedKeywords = [
        ...new Set(
          vendorKeywords.filter((keyword) => {
            if (rfqKeywordSet.has(keyword)) return true;
            if (keyword.length < 3) return false;
            return rfqKeywords.some(
              (rfqKeyword) =>
                rfqKeyword.includes(keyword) || keyword.includes(rfqKeyword)
            );
          })
        ),
      ];

      const score =
        (exactCategory ? 10 : 0) +
        matchedKeywords.length * 3 +
        (category.subcategory &&
        rfqKeywords.some((keyword) =>
          category.subcategory.toLowerCase().includes(keyword)
        )
          ? 2
          : 0);

      if (!best || score > best.score) {
        best = {
          category: category.category,
          subcategory: category.subcategory,
          matchedKeywords,
          score,
        };
      }
    }

    if (!best || best.score <= 0) continue;
    const history = vendor.productHistory[0];
    matches.push({
      vendor: {
        id: vendor.id,
        name: vendor.name,
        phone: vendor.phone || "",
        email: vendor.email || "",
        whatsappId: vendor.whatsappId || "",
        preferredChannel: vendor.preferredChannel,
      },
      ...best,
      productKey,
      lastPrice: history ? decimalToNumber(history.lastPrice) : null,
      lastQuotedAt: history?.lastQuotedAt.toISOString() || null,
    });
  }

  matches.sort((a, b) => {
    const historyDifference =
      Number(Boolean(b.lastQuotedAt)) - Number(Boolean(a.lastQuotedAt));
    return historyDifference || b.score - a.score || a.vendor.name.localeCompare(b.vendor.name);
  });

  return { productKey, keywords: rfqKeywords, matches: matches.slice(0, limit) };
}
