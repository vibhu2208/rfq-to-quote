import { extractKeywords } from "@/lib/product-match";

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

function nestedSpecsString(specs: Record<string, unknown>): string {
  const nested = specs.specs;
  if (!nested || typeof nested !== "object") return "";
  return Object.entries(nested as Record<string, unknown>)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k} ${v}`)
    .join(" ");
}

export function buildMarketplaceQuery(input: RfqInput): string | null {
  if (!input.parsedCategory && !input.parsedSpecs) return null;

  const specs = specsRecord(input.parsedSpecs);
  const parts: string[] = [];

  if (typeof specs.brand === "string" && specs.brand.trim()) {
    parts.push(specs.brand.trim());
  }
  if (typeof specs.description === "string" && specs.description.trim()) {
    parts.push(specs.description.trim());
  }
  if (input.parsedCategory) {
    parts.push(input.parsedCategory);
  }

  const nested = nestedSpecsString(specs);
  if (nested) parts.push(nested);

  const keywords = extractKeywords(input);
  if (keywords.length > 0) {
    parts.push(keywords.slice(0, 6).join(" "));
  }

  const query = [...new Set(parts.join(" ").split(/\s+/).filter(Boolean))].join(" ").trim();
  if (query.length < 3) return null;
  return query.slice(0, 120);
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
