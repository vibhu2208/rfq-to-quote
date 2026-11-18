import { extractRfqItems } from "@/lib/rfq-items";

type RfqInput = {
  parsedCategory?: string | null;
  parsedSpecs?: unknown;
  subject?: string;
  rawText?: string;
};

function specsRecord(parsedSpecs: unknown): Record<string, unknown> {
  if (!parsedSpecs || typeof parsedSpecs !== "object") return {};
  return parsedSpecs as Record<string, unknown>;
}

export type MarketplaceLineQuery = {
  lineNumber: number;
  label: string;
  query: string;
};

function compactQuery(parts: Array<string | null | undefined>, max = 100): string {
  return [...new Set(parts.join(" ").split(/\s+/).filter(Boolean))].join(" ").trim().slice(0, max);
}

function lineQueryText(item: {
  brand?: string | null;
  description?: string | null;
  model?: string | null;
}): string {
  return compactQuery([item.brand, item.description, item.model]);
}

/**
 * One marketplace search per requested line.
 * The query is the buyer's line wording — not a bag of tokens from the whole email,
 * which was pulling mounts and displays into an access-point comparison.
 */
export function buildMarketplaceLineQueries(input: RfqInput): MarketplaceLineQuery[] {
  const items = extractRfqItems(input.parsedSpecs, input.rawText);
  const lines: MarketplaceLineQuery[] = [];
  for (const item of items) {
    const query = lineQueryText(item);
    if (query.length < 3) continue;
    lines.push({
      lineNumber: item.lineNumber,
      label: (item.description || query).trim(),
      query,
    });
  }
  if (lines.length > 0) return lines.slice(0, 4);

  const specs = specsRecord(input.parsedSpecs);
  const fallback = compactQuery([
    typeof specs.brand === "string" ? specs.brand : "",
    typeof specs.description === "string" ? specs.description : "",
    input.parsedCategory,
  ]);
  if (fallback.length < 3) return [];
  return [{ lineNumber: 1, label: fallback, query: fallback }];
}

export function buildMarketplaceQuery(input: RfqInput): string | null {
  const lines = buildMarketplaceLineQueries(input);
  if (lines.length === 0) return null;
  return lines
    .map((line) => line.query)
    .join(" | ")
    .slice(0, 240);
}

export function extractBudget(parsedSpecs: unknown): number | null {
  const specs = specsRecord(parsedSpecs);
  const budget = specs.budget;
  if (typeof budget === "number" && Number.isFinite(budget)) return budget;
  if (typeof budget === "string") {
    const num = Number.parseFloat(budget.replace(/[,₹\s]/g, ""));
    if (Number.isFinite(num)) return num;
  }
  return null;
}
