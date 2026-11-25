import {
  normalizeParsedItemCategories,
  resolveProductCategory,
} from "@/lib/categories";
import { extractRfqItems, extractRequirementsFromText } from "@/lib/rfq-items";
import type { ParseRfqResult } from "@/lib/ai/parse-rfq";

const PARSE_CONFIDENCE_HEURISTIC = 0.55;

/**
 * Deterministic RFQ parse when OpenRouter is down or credits are exhausted.
 */
export function parseRfqHeuristic(rawText: string, subject?: string): ParseRfqResult {
  const fromText = extractRequirementsFromText(rawText);
  const items =
    fromText.length > 0
      ? fromText.map((item) => ({
          description: item.description,
          brand: item.brand,
          quantity: item.quantity,
          unit: item.unit,
          category: resolveProductCategory(
            item.category,
            [item.description, item.brand].filter(Boolean).join(" ")
          ),
        }))
      : extractRfqItems(null, rawText).map((item) => ({
          description: item.description,
          brand: item.brand,
          quantity: item.quantity,
          unit: item.unit,
          category: resolveProductCategory(
            item.category,
            [item.description, item.brand].filter(Boolean).join(" ")
          ),
        }));

  const { items: normalizedItems, productCategory } =
    normalizeParsedItemCategories(items, null);
  const primary = normalizedItems[0];
  const partial = fromText.length === 0 && normalizedItems.length <= 1;
  const summary =
    normalizedItems.length > 1
      ? `Heuristic parse found ${normalizedItems.length} lines from the message text.`
      : partial
        ? "Heuristic parse ran; requirement lines may be incomplete — use Re-parse when AI is available."
        : subject?.trim()
          ? `Heuristic parse: ${subject.trim()}`
          : "Heuristic parse from message text.";

  return {
    productCategory,
    specs: {
      description: primary?.description ?? null,
      quantity: primary?.quantity ?? 1,
      unit: primary?.unit ?? "pcs",
      brand: primary?.brand ?? null,
      items: normalizedItems,
    },
    items: normalizedItems,
    language: "Unknown",
    confidence: partial ? 0.35 : PARSE_CONFIDENCE_HEURISTIC,
    summary,
  };
}