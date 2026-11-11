import type { Product } from "@prisma/client";
import {
  matchProductsToRfq,
  matchProductsToRfqItems,
  flattenRequirementMatches,
  extractKeywords,
  CATALOG_RETRIEVAL_LIMIT,
  CATALOG_SUGGESTION_LIMIT,
  type RequirementMatch,
  type ProductMatch,
} from "@/lib/product-match";
import { extractRfqItems } from "@/lib/rfq-items";
import {
  applyRerankToItemMatches,
  buildRerankPayload,
  rerankCatalogMatches,
} from "@/lib/ai/rerank-catalog-matches";

export type HybridCatalogMatchResult = {
  keywords: string[];
  requirements: ReturnType<typeof extractRfqItems>;
  itemMatches: RequirementMatch[];
  matches: ProductMatch[];
  reranked: boolean;
  /** True when a follow-up AI re-rank pass could improve ordering. */
  aiEligible: boolean;
};

/**
 * Weighted top-20 retrieval + one batched AI re-rank (minimal tokens).
 * Falls back to weighted scores if AI is unavailable / fails.
 */
export async function matchRfqCatalogHybrid(
  products: Product[],
  input: {
    parsedCategory?: string | null;
    parsedSpecs?: unknown;
    subject?: string;
    rawText?: string;
  },
  options?: { skipAi?: boolean; suggestionLimit?: number }
): Promise<HybridCatalogMatchResult> {
  const suggestionLimit = options?.suggestionLimit ?? CATALOG_SUGGESTION_LIMIT;
  const requirements = extractRfqItems(input.parsedSpecs, input.rawText);
  const keywords = extractKeywords(input);

  const retrieved =
    requirements.length > 0
      ? matchProductsToRfqItems(
          products,
          {
            ...input,
            parsedSpecs: {
              ...(typeof input.parsedSpecs === "object" && input.parsedSpecs
                ? (input.parsedSpecs as object)
                : {}),
              items: requirements,
            },
          },
          CATALOG_RETRIEVAL_LIMIT
        )
      : [];

  const rerankPayload = buildRerankPayload(retrieved);
  const aiEligible = rerankPayload.some(
    (line) => !line.exact && line.candidates.length > 0
  );

  let itemMatches = retrieved;
  let reranked = false;

  if (!options?.skipAi && aiEligible) {
    try {
      const ranked = await rerankCatalogMatches(rerankPayload);
      itemMatches = applyRerankToItemMatches(retrieved, ranked, suggestionLimit);
      reranked = Object.keys(ranked).length > 0;
    } catch {
      itemMatches = retrieved.map((item) => ({
        ...item,
        matches: item.matches.slice(0, suggestionLimit),
      }));
    }
  } else {
    itemMatches = retrieved.map((item) => ({
      ...item,
      matches: item.matches.slice(0, suggestionLimit),
    }));
  }

  const matches =
    itemMatches.length > 0
      ? flattenRequirementMatches(itemMatches)
      : matchProductsToRfq(products, input, suggestionLimit);

  return {
    keywords,
    requirements,
    itemMatches,
    matches,
    reranked,
    aiEligible,
  };
}
